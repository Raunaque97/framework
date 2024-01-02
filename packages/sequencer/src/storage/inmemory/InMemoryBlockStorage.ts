import {
  HistoricalUnprovenBlockStorage,
  UnprovenBlockQueue,
  UnprovenBlockStorage,
} from "../repositories/UnprovenBlockStorage";
import type {
  UnprovenBlock,
  UnprovenBlockMetadata,
} from "../model/UnprovenBlock";
import { UnprovenBlockWithPreviousMetadata } from "../../protocol/production/BlockProducerModule";

export class InMemoryBlockStorage
  implements
    UnprovenBlockStorage,
    HistoricalUnprovenBlockStorage,
    UnprovenBlockQueue
{
  private readonly blocks: UnprovenBlock[] = [];

  private readonly metadata: UnprovenBlockMetadata[] = [];

  private cursor = 0;

  public async getBlockAt(height: number): Promise<UnprovenBlock | undefined> {
    return this.blocks.at(height);
  }

  public async getCurrentBlockHeight(): Promise<number> {
    return this.blocks.length;
  }

  public async getLatestBlock(): Promise<UnprovenBlock | undefined> {
    return await this.getBlockAt((await this.getCurrentBlockHeight()) - 1);
  }

  public async getNewBlocks(): Promise<UnprovenBlockWithPreviousMetadata[]> {
    const slice = this.blocks.slice(this.cursor);

    // eslint-disable-next-line putout/putout
    let metadata: (UnprovenBlockMetadata | undefined)[] = this.metadata.slice(
      Math.max(this.cursor - 1, 0)
    );
    if (this.cursor === 0) {
      metadata = [undefined, ...metadata];
    }

    // This assumes that getNewBlocks() is only called once per block prod cycle
    // TODO query batch storage which the last proven block was instead
    this.cursor = this.blocks.length;

    return slice.map((block, index) => ({
      block,
      lastBlockMetadata: metadata[index],
    }));
  }

  public async pushBlock(block: UnprovenBlock): Promise<void> {
    this.blocks.push(block);
  }

  public async getNewestMetadata(): Promise<UnprovenBlockMetadata | undefined> {
    return this.metadata.length > 0 ? this.metadata.at(-1) : undefined;
  }

  public async pushMetadata(metadata: UnprovenBlockMetadata): Promise<void> {
    this.metadata.push(metadata);
  }

  public async getBlock(
    transactionsHash: string
  ): Promise<UnprovenBlock | undefined> {
    return this.blocks.find(
      (block) => block.transactionsHash.toString() === transactionsHash
    );
  }
}