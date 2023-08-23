/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable guard-for-in */
/* eslint-disable @shopify/no-fully-static-classes */
/* eslint-disable import/no-unused-modules */
import { StringKeyOf } from "@proto-kit/common";
import {
  Runtime,
  RuntimeModulesRecord,
  State,
  StateMap,
} from "@proto-kit/module";
import { QueryTransportModule } from "./InMemoryQueryTransportModule";

type StateMapKey<Type> = Type extends StateMap<infer Key, any> ? Key : Type;
type StateMapValue<Type> = Type extends StateMap<any, infer Value>
  ? Value
  : Type;
type StateValue<Type> = Type extends State<infer Value> ? Value : Type;

export type PickByType<T, Value> = {
  [P in keyof T as T[P] extends Value | undefined ? P : never]: T[P];
};

export type Override<T, TypeToReplace, TypeToReplaceWith> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? Override<T[K], TypeToReplace, TypeToReplaceWith>
    : T[K] extends TypeToReplace
    ? TypeToReplaceWith
    : T[K];
};

export interface QueryGetterState<Value> {
  get: () => Promise<Value | undefined>;
}

export interface QueryGetterStateMap<Key, Value> {
  get: (key: Key) => Promise<Value | undefined>;
}

export type Query<RuntimeModules extends RuntimeModulesRecord> = {
  [K in StringKeyOf<RuntimeModules>]: {
    [L in keyof PickByType<
      InstanceType<RuntimeModules[K]>,
      State<any>
    >]: QueryGetterState<
      StateValue<PickByType<InstanceType<RuntimeModules[K]>, State<any>>[L]>
    >;
  } & {
    [L in keyof PickByType<
      InstanceType<RuntimeModules[K]>,
      StateMap<any, any>
    >]: QueryGetterStateMap<
      StateMapKey<
        PickByType<InstanceType<RuntimeModules[K]>, StateMap<any, any>>[L]
      >,
      StateMapValue<
        PickByType<InstanceType<RuntimeModules[K]>, StateMap<any, any>>[L]
      >
    >;
  };
};

export class QueryBuilderFactory {
  public static isStateMap(
    property: any
  ): asserts property is StateMap<any, any> {
    if ((property as any)?.constructor?.name !== StateMap.name) {
      throw new Error("Property is not a StateMap");
    }
  }

  public static isState(property: any): asserts property is State<any> {
    if ((property as any)?.constructor?.name !== State.name) {
      throw new Error("Property is not a StateMap");
    }
  }

  public static fromRuntime<RuntimeModules extends RuntimeModulesRecord>(
    runtime: Runtime<RuntimeModules>,
    queryTransportModule: QueryTransportModule
  ) {
    return runtime.moduleNames.reduce<Query<typeof runtime.definition.modules>>(
      (query, runtimeModuleName) => {
        runtime.isValidModuleName(
          runtime.definition.modules,
          runtimeModuleName
        );
        const runtimeModule = runtime.resolve(runtimeModuleName);

        for (const propertyName in runtimeModule) {
          const property = runtimeModule[propertyName];

          if ((property as any)?.constructor.name === StateMap.name) {
            QueryBuilderFactory.isStateMap(property);
            (query as any)[runtimeModuleName as any] = {
              ...(query as any)[runtimeModuleName as any],

              [propertyName]: {
                get: async (key: any) => {
                  const path = property.getPath(key);
                  const fields = await queryTransportModule.get(path);
                  return fields
                    ? property.valueType.fromFields(fields)
                    : undefined;
                },
              },
            };
          }

          if ((property as any)?.constructor.name === State.name) {
            QueryBuilderFactory.isState(property);
            (query as any)[runtimeModuleName as any] = {
              ...(query as any)[runtimeModuleName as any],

              [propertyName]: {
                get: async () => {
                  const path = property.path!;
                  const fields = await queryTransportModule.get(path);

                  return fields
                    ? property.valueType.fromFields(fields)
                    : undefined;
                },
              },
            };
          }
        }

        return query;
      },
      {} as any
    );
  }
}