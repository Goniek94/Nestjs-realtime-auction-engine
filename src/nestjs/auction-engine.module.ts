import type {
  DynamicModule,
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
  Provider,
} from "@nestjs/common";
import {
  AuctionEngine,
  type AuctionEngineOptions,
} from "../core/auction-engine.js";
import type { AuctionStore } from "../core/types.js";

export const AUCTION_ENGINE_OPTIONS = Symbol("AUCTION_ENGINE_OPTIONS");

export interface AuctionEngineModuleOptions extends AuctionEngineOptions {
  store: AuctionStore;
}

export interface AuctionEngineModuleAsyncOptions
  extends Pick<ModuleMetadata, "imports"> {
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  useFactory: (
    ...args: any[]
  ) => AuctionEngineModuleOptions | Promise<AuctionEngineModuleOptions>;
  isGlobal?: boolean;
}

const engineProvider: Provider = {
  provide: AuctionEngine,
  useFactory: (options: AuctionEngineModuleOptions) =>
    new AuctionEngine(options.store, options),
  inject: [AUCTION_ENGINE_OPTIONS],
};

/**
 * NestJS dynamic module exposing AuctionEngine as an injectable provider.
 *
 * It only uses @nestjs/common types, so the core package keeps zero runtime
 * dependencies and works with any NestJS version that supports dynamic modules.
 */
export class AuctionEngineModule {
  static forRoot(
    options: AuctionEngineModuleOptions & { isGlobal?: boolean },
  ): DynamicModule {
    const { isGlobal, ...engineOptions } = options;
    return {
      module: AuctionEngineModule,
      global: isGlobal ?? false,
      providers: [
        { provide: AUCTION_ENGINE_OPTIONS, useValue: engineOptions },
        engineProvider,
      ],
      exports: [AuctionEngine],
    };
  }

  static forRootAsync(options: AuctionEngineModuleAsyncOptions): DynamicModule {
    return {
      module: AuctionEngineModule,
      global: options.isGlobal ?? false,
      imports: options.imports ?? [],
      providers: [
        {
          provide: AUCTION_ENGINE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        engineProvider,
      ],
      exports: [AuctionEngine],
    };
  }
}
