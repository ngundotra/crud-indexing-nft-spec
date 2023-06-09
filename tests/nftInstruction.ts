import * as anchor from "@coral-xyz/anchor";
import { hash } from "@coral-xyz/anchor/dist/cjs/utils/sha256";
import { resolveRemainingAccounts } from "./additionalAccountsRequest";

export type ITransfer = {
  owner: anchor.web3.PublicKey;
  destination: anchor.web3.PublicKey;
  authority: anchor.web3.PublicKey;
  asset: anchor.web3.PublicKey;
};

const TRANSFER_DISC = Buffer.from(
  anchor.utils.sha256.hash("global:transfer"),
  "hex"
).slice(0, 8);
function getTransferDiscriminator() {
  return TRANSFER_DISC;
}

const PREFLIGHT_TRANSFER_DISC = Buffer.from(
  anchor.utils.sha256.hash("global:preflight_transfer"),
  "hex"
).slice(0, 8);
function getPreflightTransferDiscriminator() {
  return PREFLIGHT_TRANSFER_DISC;
}

export function createInstructionTransfer(
  programId: anchor.web3.PublicKey,
  transfer: ITransfer,
  preflight: boolean = false
): anchor.web3.TransactionInstruction {
  return {
    programId: programId,
    keys: [
      { pubkey: transfer.owner, isSigner: false, isWritable: false },
      { pubkey: transfer.destination, isSigner: false, isWritable: false },
      { pubkey: transfer.authority, isSigner: true, isWritable: false },
      { pubkey: transfer.asset, isSigner: false, isWritable: true },
    ],
    data: preflight
      ? getPreflightTransferDiscriminator()
      : getTransferDiscriminator(),
  };
}

export async function createAARTransfer<I extends anchor.Idl>(
  program: anchor.Program<I>,
  transfer: ITransfer
): Promise<anchor.web3.TransactionInstruction> {
  let ix = createInstructionTransfer(program.programId, transfer, true);
  let accounts = await resolveRemainingAccounts(program, [ix]);
  ix.keys.concat(accounts);
  return ix;
}
