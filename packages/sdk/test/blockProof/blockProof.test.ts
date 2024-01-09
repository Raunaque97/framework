import { PrivateKey, UInt64 } from "o1js";
import {
  RuntimeMethodExecutionContext,
  StateServiceProvider,
} from "@proto-kit/protocol";

import { TestingAppChain } from "@proto-kit/sdk";

import { Balances } from "./Balances";
import { MockAsyncMerkleTreeStore, RollupMerkleTree } from "@proto-kit/common";
import { ManualBlockTrigger } from "@proto-kit/sequencer";
import { InMemoryStateService } from "@proto-kit/module";

describe("blockProof", () => {
  // eslint-disable-next-line max-statements
  it("should transition block state hash", async () => {
    expect.assertions(3);

    const merklestore = new MockAsyncMerkleTreeStore();
    const tree = new RollupMerkleTree(merklestore.store);

    const totalSupply = UInt64.from(10_000);

    const appChain = TestingAppChain.fromRuntime({
      modules: {
        Balances,
      },
    });

    appChain.configurePartial({
      Runtime: {
        Balances: {
          totalSupply,
        },
      },
    });

    await appChain.start();

    const alicePrivateKey = PrivateKey.random();
    const alice = alicePrivateKey.toPublicKey();

    appChain.setSigner(alicePrivateKey);

    const balances = appChain.runtime.resolve("Balances");

    const tx1 = await appChain.transaction(alice, () => {
      balances.setBalance(alice, UInt64.from(1000));
    });

    const context = appChain.runtime.dependencyContainer.resolve(
      RuntimeMethodExecutionContext
    );
    const transitions = context.current().result.stateTransitions;

    const stateService = new InMemoryStateService();

    const stateServiceProvider = new StateServiceProvider();
    stateServiceProvider.setCurrentStateService(stateService);

    appChain.protocol.registerValue({
      StateServiceProvider: stateServiceProvider,
    });

    context.setup({} as any);

    // eslint-disable-next-line max-len
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/consistent-type-assertions
    appChain.protocol.resolve("AccountState").onTransaction({
      transaction: {
        sender: alice,
        nonce: UInt64.from(0),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const protocolSTs = context.current().result.stateTransitions;

    [transitions[1], transitions[3], ...protocolSTs].forEach((st) => {
      const provable = st.toProvable();
      tree.setLeaf(provable.path.toBigInt(), provable.to.value);
    });

    await tx1.sign();
    await tx1.send();

    const block = await appChain.produceBlock();

    const trigger = appChain.sequencer.resolveOrFail(
      "BlockTrigger",
      ManualBlockTrigger
    );
    const provenBlock = await trigger.produceProven();

    expect(provenBlock?.proof.publicOutput.stateRoot.toBigInt()).toBe(
      tree.getRoot().toBigInt()
    );

    const aliceBalance = await appChain.query.runtime.Balances.balances.get(
      alice
    );

    expect(block?.transactions[0].status.toBoolean()).toBe(true);
    expect(aliceBalance?.toBigInt()).toBe(1000n);
  }, 120_000);
});
