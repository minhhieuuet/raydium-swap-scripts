import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';
import RaydiumSwap from './RaydiumSwap'
import { Transaction, VersionedTransaction, LAMPORTS_PER_SOL, Connection, PublicKey, ComputeBudgetProgram } from '@solana/web3.js'
import dotenv from 'dotenv';
dotenv.config();
// download file from https://api.raydium.io/v2/sdk/liquidity/mainnet.json
const swap = async () => {
  const executeSwap = true // Change to true to execute swap
  const useVersionedTransaction = false // Use versioned transaction
  const tokenAAmount = 0.000001 // e.g. 0.01 SOL -> B_TOKEN

  const baseMint = 'So11111111111111111111111111111111111111112' // e.g. SOLANA mint address
  const quoteMint = '566FjhKsg1xtqFLoTuKNvhb6wwRaeqWQCgTDw6WTpump' // e.g. PYTH mint address
  // console.log(process.env.RPC_URL);
  const raydiumSwap = new RaydiumSwap(process.env.RPC_URL, process.env.WALLET_PRIVATE_KEY)
  console.log(`Raydium swap initialized`)
  const connection = new Connection(process.env.RPC_URL, { commitment: 'confirmed' })
  const gas = await connection.getRecentPrioritizationFees(
    {
      lockedWritableAccounts: [
        new PublicKey("EV6hQGnA7tt612qCryuyuWt625zzhKRrEUJ7Es3Pk5bQ")
      ]
    }
  )
  console.log(gas)
  // return;

  // Loading with pool keys from https://api.raydium.io/v2/sdk/liquidity/mainnet.json
  // download and save to pools.json

  await raydiumSwap.loadPoolKeys()
  console.log(`Loaded pool keys`)

  // Trying to find pool info in the json we loaded earlier and by comparing baseMint and tokenBAddress
  let poolInfo = raydiumSwap.findPoolInfoForTokens(baseMint, quoteMint)

  if (!poolInfo) poolInfo = await raydiumSwap.findRaydiumPoolInfo(baseMint, quoteMint)

  if (!poolInfo) {
    throw new Error("Couldn't find the pool info")
  }

  // console.log('Found pool info', poolInfo)

  const tx = await raydiumSwap.getSwapTransaction(
    quoteMint,
    tokenAAmount,
    poolInfo,
    0.00005 * LAMPORTS_PER_SOL, // Prioritization fee, now set to (0.0005 SOL)
    useVersionedTransaction,
    'in',
    5 // Slippage
  )
  // return;

  if (executeSwap) {
    const txid = useVersionedTransaction
      ? await raydiumSwap.sendVersionedTransaction(tx as VersionedTransaction)
      : await raydiumSwap.sendLegacyTransaction(tx as Transaction)

    console.log(`https://solscan.io/tx/${txid}`)
  } else {
    const simRes = useVersionedTransaction
      ? await raydiumSwap.simulateVersionedTransaction(tx as VersionedTransaction)
      : await raydiumSwap.simulateLegacyTransaction(tx as Transaction)

    console.log(simRes)
  }
}

swap()
