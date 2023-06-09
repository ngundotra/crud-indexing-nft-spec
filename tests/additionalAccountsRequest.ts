import * as anchor from "@coral-xyz/anchor";

/**
 *
 * @param program Assumes this program's IDL has `ExternalIAccountMeta` defined (copy of `IAccountMeta`)
 * @param instructions
 * @returns
 */
export async function resolveRemainingAccounts<I extends anchor.Idl>(
  program: anchor.Program<I>,
  instructions: anchor.web3.TransactionInstruction[],
  verbose: boolean = false
): Promise<anchor.web3.AccountMeta[]> {
  // Simulate transaction
  let message = anchor.web3.MessageV0.compile({
    payerKey: program.provider.publicKey!,
    instructions,
    recentBlockhash: (await program.provider.connection.getRecentBlockhash())
      .blockhash,
  });
  let transaction = new anchor.web3.VersionedTransaction(message);
  let simulationResult = await program.provider.connection.simulateTransaction(
    transaction,
    { commitment: "confirmed" }
  );

  if (verbose) {
    console.log("CUs consumed:", simulationResult.value.unitsConsumed);
    console.log("Logs", simulationResult.value.logs);
  }

  // When the simulation RPC response is fixed, then the following code will work
  // but until then, we have to parse the logs manually
  // ===============================================================
  // let returnDataTuple = simulationResult.value.returnData;
  // let [b64Data, encoding] = returnDataTuple["data"];
  // if (encoding !== "base64") {
  //   throw new Error("Unsupported encoding: " + encoding);
  // }
  // ===============================================================
  let logs = simulationResult.value.logs;
  let b64Data = logs[logs.length - 2].split(" ")[3];
  let data = anchor.utils.bytes.base64.decode(b64Data);

  // We start deserializing the Vec<IAccountMeta> from the 5th byte
  // The first 4 bytes are u32 for the Vec of the return data
  let numBytes = data.slice(0, 4);
  let numMetas = new anchor.BN(numBytes, null, "le");
  let offset = 4;

  let realAccountMetas: anchor.web3.AccountMeta[] = [];
  let coder = program.coder.types;
  const metaSize = 34;
  for (let i = 0; i < numMetas.toNumber(); i += 1) {
    const start = offset + i * metaSize;
    const end = start + metaSize;
    let meta = coder.decode("ExternalIAccountMeta", data.slice(start, end));
    realAccountMetas.push({
      pubkey: meta.pubkey,
      isWritable: meta.writable,
      isSigner: meta.signer,
    });
  }
  return realAccountMetas;
}
