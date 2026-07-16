import {
  type EIP12UnsignedTransaction,
  type SignedTransaction,
  type TokenAmount,
  Network,
  isHex,
  utxoDiff,
  utxoSum
} from "@fleet-sdk/common";
import { ErgoMessage, ErgoUnsignedTransaction } from "@fleet-sdk/core";
import { type ByteInput, bigintBE, ensureBytes, hex } from "@fleet-sdk/crypto";
import { serializeTransaction } from "@fleet-sdk/serializer";
import {
  ProverBuilder$,
  ProverHints$,
  ProverSecret$,
  SigmaProp$,
  SigmaPropProver$,
  SigmaPropVerifier$
} from "sigmastate-js/main";
import type { ErgoHDKey } from "../ergoHDKey";
import type { ISigmaProver, Message, UnsignedTransaction } from "./prover";

export type SigmaBlockchainParameters = {
  storageFeeFactor: number;
  minValuePerByte: number;
  maxBlockSize: number;
  tokenAccessCost: number;
  inputCost: number;
  dataInputCost: number;
  outputCost: number;
  maxBlockCost: number;
  softForkStartingHeight?: number;
  softForkVotesCollected?: number;
  blockVersion: number;
};

export type SigmaBlockchainStateContext = {
  sigmaLastHeaders: unknown[];
  previousStateDigest: string;
  sigmaPreHeader: unknown;
};

export type SigmaProverOptions = {
  context: SigmaBlockchainStateContext;
  parameters: SigmaBlockchainParameters;
  network?: Network;
  baseCost?: number;
};

type SigmaJsBuilder = ReturnType<typeof ProverBuilder$.create>;
type SigmaJsProver = ReturnType<SigmaJsBuilder["build"]>;
type SigmaJsParameters = Parameters<typeof ProverBuilder$.create>[0];
type SigmaJsStateContext = Parameters<SigmaJsProver["reduce"]>[0];

/**
 * Full Sigma interpreter-backed prover.
 *
 * Unlike {@link Prover}, this implementation reduces each input ErgoTree before
 * signing and therefore supports arbitrary Sigma propositions, not only P2PK
 * inputs.
 */
export class SigmaProver implements ISigmaProver {
  readonly #context: SigmaBlockchainStateContext;
  readonly #parameters: SigmaBlockchainParameters;
  readonly #network: Network;
  readonly #baseCost: number;

  constructor(options: SigmaProverOptions) {
    this.#context = options.context;
    this.#parameters = options.parameters;
    this.#network = options.network ?? Network.Mainnet;
    this.#baseCost = options.baseCost ?? 0;
  }

  signTransaction(unsignedTx: UnsignedTransaction, keys: ErgoHDKey[]): SignedTransaction {
    const tx = toEIP12Transaction(unsignedTx);
    const builder = ProverBuilder$.create(
      this.#parameters as SigmaJsParameters,
      this.#network
    );

    for (const key of keys) {
      builder.withDLogSecret(readSecret(key));
    }

    const prover = builder.build();
    const reduced = prover.reduce(
      this.#context as SigmaJsStateContext,
      tx,
      tx.inputs,
      tx.dataInputs,
      getBurningTokens(tx),
      this.#baseCost
    );

    return prover.signReduced(reduced);
  }

  signMessage(message: ErgoMessage, key: ErgoHDKey): Uint8Array {
    const secret = ProverSecret$.dlog(readSecret(key));
    const prover = SigmaPropProver$.withSecrets([secret]);
    const signature = prover.signMessage(
      secret.publicKey(),
      toInt8Array(message.serialize().toBytes()),
      ProverHints$.empty()
    );

    return Uint8Array.from(signature);
  }

  verify(message: Message, proof: ByteInput, publicKey: ErgoHDKey | Uint8Array): boolean {
    const keyBytes = publicKey instanceof Uint8Array ? publicKey : publicKey.publicKey;
    const sigmaProp = SigmaProp$.fromPointHex(hex.encode(keyBytes));

    return SigmaPropVerifier$.create().verifySignature(
      sigmaProp,
      toInt8Array(toMessageBytes(message)),
      toInt8Array(ensureBytes(proof))
    );
  }
}

function readSecret(key: ErgoHDKey): bigint {
  if (!key.privateKey) throw new Error("Private key is not present");
  return bigintBE.encode(key.privateKey);
}

function toInt8Array(bytes: Uint8Array): Int8Array {
  return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function toEIP12Transaction(tx: UnsignedTransaction): EIP12UnsignedTransaction {
  return tx instanceof ErgoUnsignedTransaction ? tx.toEIP12Object() : tx;
}

function toMessageBytes(message: Message): Uint8Array {
  if (typeof message === "string") {
    return isHex(message)
      ? hex.decode(message)
      : ErgoMessage.decode(message).serialize().toBytes();
  }

  if (message instanceof ErgoMessage) return message.serialize().toBytes();
  if (message instanceof Uint8Array) return message;
  if (message instanceof ErgoUnsignedTransaction) return message.toBytes();

  return serializeTransaction({
    ...message,
    inputs: message.inputs.map((input) => ({
      ...input,
      spendingProof: undefined,
      extension:
        "extension" in input ? input.extension : (input.spendingProof?.extension ?? {})
    }))
  }).toBytes();
}

function getBurningTokens(tx: EIP12UnsignedTransaction): TokenAmount<bigint>[] {
  const diff = utxoDiff(utxoSum(tx.inputs), utxoSum(tx.outputs));
  if (diff.tokens.length > 0) {
    diff.tokens = diff.tokens.filter((token) => token.tokenId !== tx.inputs[0].boxId);
  }

  return diff.tokens;
}
