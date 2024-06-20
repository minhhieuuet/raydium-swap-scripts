import { PubKey } from './../node_modules/@noble/curves/src/abstract/weierstrass';
import RaydiumSwap from './RaydiumSwap'
import { Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import dotenv from 'dotenv';
import {Connection, PublicKey} from '@solana/web3.js'
import { LIQUIDITY_STATE_LAYOUT_V4 } from '@raydium-io/raydium-sdk';
dotenv.config();
// download file from https://api.raydium.io/v2/sdk/liquidity/mainnet.json
const swap = async () => {
  const executeSwap = true // Change to true to execute swap
  const useVersionedTransaction = true // Use versioned transaction
  const tokenAAmount = 0.000001 // e.g. 0.01 SOL -> B_TOKEN

  const baseMint = 'So11111111111111111111111111111111111111112' // e.g. SOLANA mint address
  const quoteMint = 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3' // e.g. PYTH mint address
  // console.log(process.env.RPC_URL);
  const raydiumSwap = new RaydiumSwap(process.env.RPC_URL, process.env.WALLET_PRIVATE_KEY)
  console.log(`Raydium swap initialized`)
  const connection = new Connection(process.env.RPC_URL, { commitment: 'confirmed' })

  // Loading with pool keys from https://api.raydium.io/v2/sdk/liquidity/mainnet.json
  // download and save to pools.json

  await raydiumSwap.loadPoolKeys()
  // console.log(`Loaded pool keys`)

  // // // Trying to find pool info in the json we loaded earlier and by comparing baseMint and tokenBAddress
  // let poolInfo = raydiumSwap.findPoolInfoForTokens(baseMint, quoteMint)
  // // console.log(poolInfo)

  // if (!poolInfo) poolInfo = await raydiumSwap.findRaydiumPoolInfo(baseMint, quoteMint)
  // console.log(`Pool key`, poolInfo.id.toBase58());

  // console.log(poolInfo)
  const POOL_ID = "9n3dSLrERZQp95dHXywft7xV8D8xnGFLaUHtEhQVaXaC"; // Pool id of PYTH-SOL
  const poolId = new PublicKey(POOL_ID);

  const info = await connection.getAccountInfo(poolId);
  const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);
  console.log(poolState);
//   const baseDecimal = 10 ** poolState.baseDecimal.toNumber(); // e.g. 10 ^ 6
//   const quoteDecimal = 10 ** poolState.quoteDecimal.toNumber();

//   console.log(poolState.baseVault.toBase58(), poolState.quoteVault.toBase58())
//   const baseTokenAmount = await connection.getTokenAccountBalance(
//     poolState.baseVault
//   );
//   const quoteTokenAmount = await connection.getTokenAccountBalance(
//     poolState.quoteVault
//   );
//   console.log(baseTokenAmount.value.uiAmount, quoteTokenAmount.value.uiAmount);
//   console.log(
//     "base vault balance " + baseTokenAmount.value.uiAmount,
//     "quote vault balance " + quoteTokenAmount.value.uiAmount,
// );

  // if (!poolInfo) {
  //   throw new Error("Couldn't find the pool info")
  // }
  // console.log(poolInfo);
}

swap()
