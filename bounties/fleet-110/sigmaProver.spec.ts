import {
  ErgoMessage,
  OutputBuilder,
  SGroupElement,
  SSigmaProp,
  TransactionBuilder
} from "@fleet-sdk/core";
import { hex } from "@fleet-sdk/crypto";
import { Address, verify_signature } from "ergo-lib-wasm-nodejs";
import { describe, expect, it } from "vitest";
import {
  BLOCKCHAIN_PARAMETERS,
  mockBlockchainStateContext,
  mockUTxO
} from "../../../mock-chain/src";
import { ErgoHDKey } from "../ergoHDKey";
import { generateMnemonic } from "../mnemonic";
import { SigmaProver } from "./sigmaProver";

const height = 1_234_209;
const externalAddress = "9gN8gmyaDBuWPZLn8zj9uZxnLUj4TE9rtedtLGNjf6cUhTmoTwc";

function createProver(): SigmaProver {
  return new SigmaProver({
    context: mockBlockchainStateContext(),
    parameters: BLOCKCHAIN_PARAMETERS
  });
}

describe("SigmaProver transaction signing", () => {
  it("signs and verifies a P2PK transaction in all supported representations", async () => {
    const key = await ErgoHDKey.fromMnemonic(generateMnemonic());
    const input = mockUTxO({ value: 1_000_000_000n, ergoTree: key.address.ergoTree });
    const unsignedTx = new TransactionBuilder(height)
      .from(input)
      .to(new OutputBuilder(10_000_000n, externalAddress))
      .sendChangeTo(key.address)
      .payMinFee()
      .build();

    const prover = createProver();
    const signedTx = prover.signTransaction(unsignedTx, [key]);
    const proof = hex.decode(signedTx.inputs[0].spendingProof?.proofBytes ?? "");

    expect(proof.length).to.be.greaterThan(0);
    expect(prover.verify(unsignedTx, proof, key)).to.be.true;
    expect(prover.verify(unsignedTx.toEIP12Object(), proof, key)).to.be.true;
    expect(prover.verify(signedTx, proof, key)).to.be.true;
    expect(prover.verify(unsignedTx.toBytes(), proof, key.publicKey)).to.be.true;

    const address = Address.from_public_key(key.publicKey);
    expect(verify_signature(address, unsignedTx.toBytes(), proof)).to.be.true;
  });

  it("reduces and signs a register-backed Sigma proposition", async () => {
    const root = await ErgoHDKey.fromMnemonic(generateMnemonic());
    const signer = root.deriveChild(1);
    const input = mockUTxO({
      value: 1_000_000_000n,
      ergoTree: "190600e4c6a70408",
      additionalRegisters: {
        R4: SSigmaProp(SGroupElement(signer.publicKey)).toHex()
      }
    });
    const unsignedTx = new TransactionBuilder(height)
      .from(input)
      .to(new OutputBuilder(10_000_000n, externalAddress))
      .sendChangeTo(root.address)
      .payMinFee()
      .build();

    const signedTx = createProver().signTransaction(unsignedTx.toEIP12Object(), [signer]);

    expect(signedTx.inputs[0].spendingProof?.proofBytes).not.to.be.empty;
    expect(signedTx.outputs).to.have.length(unsignedTx.outputs.length);
  });

  it("passes explicitly burned tokens to SigmaJS reduction", async () => {
    const key = await ErgoHDKey.fromMnemonic(generateMnemonic());
    const token = { tokenId: "01".repeat(32), amount: 10n };
    const input = mockUTxO({
      value: 1_000_000_000n,
      ergoTree: key.address.ergoTree,
      assets: [token]
    });
    const unsignedTx = new TransactionBuilder(height)
      .from(input, { ensureInclusion: true })
      .to(new OutputBuilder(10_000_000n, externalAddress))
      .burnTokens(token)
      .sendChangeTo(key.address)
      .payMinFee()
      .build();

    const signedTx = createProver().signTransaction(unsignedTx, [key]);

    expect(signedTx.inputs[0].spendingProof?.proofBytes).not.to.be.empty;
  });

  it("rejects keys without private material", async () => {
    const key = await ErgoHDKey.fromMnemonic(generateMnemonic());
    const input = mockUTxO({ value: 1_000_000_000n, ergoTree: key.address.ergoTree });
    const unsignedTx = new TransactionBuilder(height)
      .from(input)
      .to(new OutputBuilder(10_000_000n, externalAddress))
      .sendChangeTo(key.address)
      .payMinFee()
      .build();

    expect(() => createProver().signTransaction(unsignedTx, [key.wipePrivateData()])).to.throw(
      "Private key is not present"
    );
  });
});

describe("SigmaProver message signing", () => {
  it("signs and verifies every supported message representation", async () => {
    const key = await ErgoHDKey.fromMnemonic(generateMnemonic());
    const message = ErgoMessage.fromData("fleet sigma prover");
    const bytes = message.serialize().toBytes();
    const prover = createProver();
    const signature = prover.signMessage(message, key);

    expect(signature.length).to.be.greaterThan(0);
    expect(prover.verify(message, signature, key)).to.be.true;
    expect(prover.verify(bytes, signature, key.publicKey)).to.be.true;
    expect(prover.verify(hex.encode(bytes), hex.encode(signature), key)).to.be.true;
    expect(prover.verify(message.encode(), signature, key)).to.be.true;

    const other = await ErgoHDKey.fromMnemonic(generateMnemonic());
    expect(prover.verify(message, signature, other)).to.be.false;
  });
});
