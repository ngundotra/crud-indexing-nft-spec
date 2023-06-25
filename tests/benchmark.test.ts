import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BenchmarkAar } from "../target/types/benchmark_aar";
import { BenchmarkAarCallee } from "../target/types/benchmark_aar_callee";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { additionalAccountsRequest } from "./additionalAccountsRequest";

function profileLogs(logs: string[], nameMap: Record<string, string>) {
  let sums = {};
  for (const log of logs) {
    let matches = log.matchAll(
      /^Program (.*) consumed (.*) of (.*) compute units/g
    );

    let match = matches.next();
    if (match.value) {
      let programId = match.value[1] as string;
      let computeUnits = Number.parseInt(match.value[2]);
      let totalCompute = Number.parseInt(match.value[3]);
      sums[nameMap[programId]] = (sums[nameMap[programId]] ?? 0) + computeUnits;
      // console.log(nameMap[programId] ?? programId, computeUnits, totalCompute);
    }
  }
  // console.log(`Fat: ${fat} ${fat / sums["benchmark"]}`);
  let fat = sums["benchmark"] - sums["callee"];
  return { fat, pct: fat / sums["benchmark"] };
}

describe("marketplace.e2e", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const benchmark = anchor.workspace.BenchmarkAar as Program<BenchmarkAar>;
  const callee = anchor.workspace
    .BenchmarkAarCallee as Program<BenchmarkAarCallee>;

  let provider = benchmark.provider;
  const params = [1, 5, 10, 20, 30];
  // const params = [10];

  describe.skip("Vanilla preflight", () => {
    it("AAR works up to 30 accounts", async () => {
      await benchmark.methods
        .preflightRawExample(30)
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      try {
        await benchmark.methods
          .preflightRawExample(31)
          .rpc({ skipPreflight: true, commitment: "confirmed" });
      } catch (_) {
        return;
      }
      throw new Error("Should have errored");
    });
    it("Raw Example", async () => {
      let firstCu = 0;
      for (const numAccounts of params) {
        let txId = await benchmark.methods
          .preflightRawExample(numAccounts)
          .rpc({ skipPreflight: true, commitment: "confirmed" });
        let result = await provider.connection.getTransaction(txId, {
          commitment: "confirmed",
        });

        let cus = result.meta.computeUnitsConsumed;
        if (firstCu === 0) {
          firstCu = cus;
        }
        console.log(
          numAccounts,
          cus,
          cus - firstCu,
          (cus - firstCu) / numAccounts
        );
      }
    });
    it("Benchmark against no return data", async () => {
      let firstCu = 0;
      for (const numAccounts of params) {
        let txId = await benchmark.methods
          .rawExample(numAccounts)
          .rpc({ skipPreflight: true, commitment: "confirmed" });
        let result = await provider.connection.getTransaction(txId, {
          commitment: "confirmed",
        });

        let cus = result.meta.computeUnitsConsumed;
        if (firstCu === 0) {
          firstCu = cus;
        }
        console.log(
          numAccounts,
          cus,
          cus - firstCu,
          (cus - firstCu) / numAccounts
        );
      }
    });
  });
  describe("AAR for on-chain resolution", () => {
    it("AAR test", async () => {
      let firstCu = 0;
      for (const numAccounts of params) {
        let ix = await benchmark.methods
          .transfer(numAccounts)
          .accounts({
            program: callee.programId,
          })
          .instruction();

        // In place mutates the instruction
        await additionalAccountsRequest(benchmark, ix, "transfer");

        let tx = new anchor.web3.Transaction();
        tx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: Math.floor(1.4e6) })
        );
        tx.add(ix);

        let txid = await provider.sendAndConfirm(tx, [], {
          commitment: "confirmed",
          skipPreflight: true,
        });

        let result = await provider.connection.getTransaction(txid, {
          commitment: "confirmed",
        });
        let cus = result.meta.computeUnitsConsumed;
        if (firstCu === 0) {
          firstCu = cus;
        }

        if (result.meta.logMessages) {
          let nameMap = {};
          nameMap[benchmark.programId.toBase58()] = "benchmark";
          nameMap[callee.programId.toBase58()] = "callee";
          let { fat, pct } = profileLogs(result.meta.logMessages, nameMap);

          console.log(
            numAccounts,
            cus,
            cus - firstCu,
            (cus - firstCu) / numAccounts,
            fat,
            Math.floor(pct * 1e4) / 100
          );
        }
      }
    });
  });
});
