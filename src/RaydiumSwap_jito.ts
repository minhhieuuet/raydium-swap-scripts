import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  GetProgramAccountsResponse,
  SystemProgram
} from '@solana/web3.js'
import {
  Liquidity,
  LiquidityPoolKeys,
  jsonInfo2PoolKeys,
  LiquidityPoolJsonInfo,
  TokenAccount,
  Token,
  TokenAmount,
  TOKEN_PROGRAM_ID,
  Percent,
  SPL_ACCOUNT_LAYOUT,
  LIQUIDITY_STATE_LAYOUT_V4,
  MARKET_STATE_LAYOUT_V3,
  Market,
  CurrencyAmount,
  Currency,
} from '@raydium-io/raydium-sdk'
import { Wallet } from '@project-serum/anchor'
import base58 from 'bs58'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes'
import axios from 'axios'

class RaydiumSwap {
  static RAYDIUM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
  static SOL_ADDRESS = "So11111111111111111111111111111111111111112";

  allPoolKeysJson: LiquidityPoolJsonInfo[]
  connection: Connection
  wallet: Wallet

  constructor(RPC_URL: string, WALLET_PRIVATE_KEY: string) {
    this.connection = new Connection(RPC_URL, { commitment: 'confirmed' })
    this.wallet = new Wallet(Keypair.fromSecretKey(base58.decode(WALLET_PRIVATE_KEY)))
  }

  async loadPoolKeys() {
    if (existsSync('pools.json')) {
      this.allPoolKeysJson = JSON.parse((await readFile('pools.json')).toString()).unOfficial
      return
    }

    throw new Error('no file found')
  }

  findPoolInfoForTokens(mintA: string, mintB: string) {
    const poolData = this.allPoolKeysJson.find(
      (i) => (i.baseMint === mintA && i.quoteMint === mintB) || (i.baseMint === mintB && i.quoteMint === mintA)
    )

    if (!poolData) return null

    return jsonInfo2PoolKeys(poolData) as LiquidityPoolKeys
  }

  private async _getProgramAccounts(baseMint: string, quoteMint: string): Promise<GetProgramAccountsResponse> {
    const layout = LIQUIDITY_STATE_LAYOUT_V4

    return this.connection.getProgramAccounts(new PublicKey(RaydiumSwap.RAYDIUM_V4_PROGRAM_ID), {
      filters: [
        { dataSize: layout.span },
        {
          memcmp: {
            offset: layout.offsetOf('baseMint'),
            bytes: new PublicKey(baseMint).toBase58(),
          },
        },
        {
          memcmp: {
            offset: layout.offsetOf('quoteMint'),
            bytes: new PublicKey(quoteMint).toBase58(),
          },
        },
      ],
    })
  }

  async getProgramAccounts(baseMint: string, quoteMint: string) {
    const response = await Promise.all([
      this._getProgramAccounts(baseMint, quoteMint),
      this._getProgramAccounts(quoteMint, baseMint),
    ])

    return response.filter((r) => r.length > 0)[0] || []
  }

  async findRaydiumPoolInfoByPoolId(baseMint: string, quoteMint: string, poolId?: string): Promise<LiquidityPoolKeys | undefined> {
    const layout = LIQUIDITY_STATE_LAYOUT_V4

    const programData = await this.getProgramAccounts(baseMint, quoteMint)
    const connection = new Connection(process.env.RPC_URL, { commitment: 'confirmed' })
    // const collectedPoolResults = programData
    //   .map((info) => ({
    //     id: new PublicKey(info.pubkey),
    //     version: 4,
    //     programId: new PublicKey(RaydiumSwap.RAYDIUM_V4_PROGRAM_ID),
    //     ...layout.decode(info.account.data),
    //   }))
    //   .flat()
    const info = await connection.getAccountInfo(new PublicKey(poolId));
    const pool = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);
    

    if (!pool) return null

    const market = await this.connection.getAccountInfo(new PublicKey(poolId)).then((item) => ({
      programId: item.owner,
      ...MARKET_STATE_LAYOUT_V3.decode(item.data),
    }))

    const authority = Liquidity.getAssociatedAuthority({
      programId: new PublicKey(RaydiumSwap.RAYDIUM_V4_PROGRAM_ID),
    }).publicKey

    const marketProgramId = market.programId
    const OPEN_BOOK_AMM = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"); 

    const poolKeys = {
      id: new PublicKey(poolId),
      baseMint: pool.baseMint,
      quoteMint: pool.quoteMint,
      lpMint: pool.lpMint,
      baseDecimals: Number.parseInt(pool.baseDecimal.toString()),
      quoteDecimals: Number.parseInt(pool.quoteDecimal.toString()),
      lpDecimals: Number.parseInt(pool.baseDecimal.toString()),
      version: 4,
      programId: OPEN_BOOK_AMM,
      openOrders: pool.openOrders,
      targetOrders: pool.targetOrders,
      baseVault: pool.baseVault,
      quoteVault: pool.quoteVault,
      marketVersion: 3,
      authority: authority,
      marketProgramId,
      marketId: market.ownAddress,
      marketAuthority: Market.getAssociatedAuthority({
        programId: marketProgramId,
        marketId: market.ownAddress,
      }).publicKey,
      marketBaseVault: market.baseVault,
      marketQuoteVault: market.quoteVault,
      marketBids: market.bids,
      marketAsks: market.asks,
      marketEventQueue: market.eventQueue,
      withdrawQueue: pool.withdrawQueue,
      lpVault: pool.lpVault,
      lookupTableAccount: PublicKey.default,
    } as LiquidityPoolKeys

    return poolKeys
  }

  async findRaydiumPoolInfo(baseMint: string, quoteMint: string): Promise<LiquidityPoolKeys | undefined> {
    const layout = LIQUIDITY_STATE_LAYOUT_V4

    const programData = await this.getProgramAccounts(baseMint, quoteMint)

    const collectedPoolResults = programData
      .map((info) => ({
        id: new PublicKey(info.pubkey),
        version: 4,
        programId: new PublicKey(RaydiumSwap.RAYDIUM_V4_PROGRAM_ID),
        ...layout.decode(info.account.data),
      }))
      .flat()

    const pool = collectedPoolResults[0]

    if (!pool) return null

    const market = await this.connection.getAccountInfo(pool.marketId).then((item) => ({
      programId: item.owner,
      ...MARKET_STATE_LAYOUT_V3.decode(item.data),
    }))

    const authority = Liquidity.getAssociatedAuthority({
      programId: new PublicKey(RaydiumSwap.RAYDIUM_V4_PROGRAM_ID),
    }).publicKey

    const marketProgramId = market.programId

    const poolKeys = {
      id: pool.id,
      baseMint: pool.baseMint,
      quoteMint: pool.quoteMint,
      lpMint: pool.lpMint,
      baseDecimals: Number.parseInt(pool.baseDecimal.toString()),
      quoteDecimals: Number.parseInt(pool.quoteDecimal.toString()),
      lpDecimals: Number.parseInt(pool.baseDecimal.toString()),
      version: pool.version,
      programId: pool.programId,
      openOrders: pool.openOrders,
      targetOrders: pool.targetOrders,
      baseVault: pool.baseVault,
      quoteVault: pool.quoteVault,
      marketVersion: 3,
      authority: authority,
      marketProgramId,
      marketId: market.ownAddress,
      marketAuthority: Market.getAssociatedAuthority({
        programId: marketProgramId,
        marketId: market.ownAddress,
      }).publicKey,
      marketBaseVault: market.baseVault,
      marketQuoteVault: market.quoteVault,
      marketBids: market.bids,
      marketAsks: market.asks,
      marketEventQueue: market.eventQueue,
      withdrawQueue: pool.withdrawQueue,
      lpVault: pool.lpVault,
      lookupTableAccount: PublicKey.default,
    } as LiquidityPoolKeys

    return poolKeys
  }

  async getOwnerTokenAccounts() {
    const walletTokenAccount = await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
      programId: TOKEN_PROGRAM_ID,
    })

    return walletTokenAccount.value.map((i) => ({
      pubkey: i.pubkey,
      programId: i.account.owner,
      accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }))
  }

  async getSwapTransactionRaw(
    toToken: string,
    amount: number,
    poolKeys: LiquidityPoolKeys,
    maxLamports: number = 100000,
    useVersionedTransaction = true,
    fixedSide: 'in' | 'out' = 'in',
    slippage: number = 5
  ) {
    const directionIn = poolKeys.quoteMint.toString() == toToken
    const { minAmountOut, amountIn } = await this.calcAmountOut(poolKeys, amount, slippage, directionIn)
    console.log(`Amount in: ${amountIn.toExact()} ${poolKeys.baseMint.toString()}`)
    console.log(`Min amount out: ${minAmountOut.toExact()} ${poolKeys.quoteMint.toString()}`)

    const userTokenAccounts = await this.getOwnerTokenAccounts()
    const swapTransaction = await Liquidity.makeSwapInstructionSimple({
      connection: this.connection,
      makeTxVersion: useVersionedTransaction ? 0 : 1,
      poolKeys: {
        ...poolKeys,
      },
      userKeys: {
        tokenAccounts: userTokenAccounts,
        owner: this.wallet.publicKey,
      },
      amountIn: amountIn,
      amountOut: minAmountOut,
      fixedSide: fixedSide,
      config: {
        bypassAssociatedCheck: false,
      }
    })
    return swapTransaction;

  }

  async getSwapTransaction(
    toToken: string,
    amount: number,
    poolKeys: LiquidityPoolKeys,
    maxLamports: number = 100000,
    useVersionedTransaction = true,
    fixedSide: 'in' | 'out' = 'in',
    slippage: number = 5
  ): Promise<Transaction | VersionedTransaction> {
    const directionIn = poolKeys.quoteMint.toString() == toToken
    const { minAmountOut, amountIn } = await this.calcAmountOut(poolKeys, amount, slippage, directionIn)
    console.log(`Amount in: ${amountIn.toExact()} ${poolKeys.baseMint.toString()}`)
    console.log(`Min amount out: ${minAmountOut.toExact()} ${poolKeys.quoteMint.toString()}`)

    const userTokenAccounts = await this.getOwnerTokenAccounts()
    const swapTransaction = await Liquidity.makeSwapInstructionSimple({
      connection: this.connection,
      makeTxVersion: useVersionedTransaction ? 0 : 1,
      poolKeys: {
        ...poolKeys,
      },
      userKeys: {
        tokenAccounts: userTokenAccounts,
        owner: this.wallet.publicKey,
      },
      amountIn: amountIn,
      amountOut: minAmountOut,
      fixedSide: fixedSide,
      config: {
        bypassAssociatedCheck: false,
      }
    });
    const swapSellTransaction = await this.getSwapTransactionRaw(
      RaydiumSwap.SOL_ADDRESS,
      Number(minAmountOut.toExact()),
      poolKeys,
      maxLamports,
      useVersionedTransaction,
    );

    const recentBlockhashForSwap = await this.connection.getLatestBlockhash()
    const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean)
    const sellInstructions = swapSellTransaction.innerTransactions[0].instructions.filter(Boolean)

    if (useVersionedTransaction) {
      const versionedTransaction = new VersionedTransaction(
        new TransactionMessage({
          payerKey: this.wallet.publicKey,
          recentBlockhash: recentBlockhashForSwap.blockhash,
          instructions: instructions,
        }).compileToV0Message()
      )
      const versionedSellTransaction = new VersionedTransaction(
        new TransactionMessage({
          payerKey: this.wallet.publicKey,
          recentBlockhash: recentBlockhashForSwap.blockhash,
          instructions: sellInstructions,
        }).compileToV0Message()
      )
      // use jito
      const jitoFee = "0.00001";
      const jitoFeeWallet = "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY";
      const endpoint = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
      const fee = new CurrencyAmount(Currency.SOL, jitoFee, false).raw.toNumber();
      console.log(`Calculated fee: ${fee} lamports`);
      const jitTipTxFeeMessage = new TransactionMessage({
        payerKey: this.wallet.publicKey,
        recentBlockhash: recentBlockhashForSwap.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: this.wallet.payer.publicKey,
            toPubkey: new PublicKey(bs58.decode(jitoFeeWallet)),
            lamports: fee,
          }),
        ],
      }).compileToV0Message();

      const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
      jitoFeeTx.sign([this.wallet.payer]);

      versionedTransaction.sign([this.wallet.payer])
      versionedSellTransaction.sign([this.wallet.payer])
      const jitoTxsignature = bs58.encode(jitoFeeTx.signatures[0]);
      const serializedjitoFeeTx = bs58.encode(jitoFeeTx.serialize());
      const serializedTransaction = bs58.encode(versionedTransaction.serialize());
      const serializedSellTransaction = bs58.encode(versionedSellTransaction.serialize());
      const serializedTransactions = [serializedjitoFeeTx, serializedTransaction, serializedSellTransaction];
      const res = await axios.post(endpoint, {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [serializedTransactions],
      });
      console.log(res.data);
      console.log(`Tx`, jitoTxsignature)

      return versionedTransaction
    }

    const legacyTransaction = new Transaction({
      blockhash: recentBlockhashForSwap.blockhash,
      lastValidBlockHeight: recentBlockhashForSwap.lastValidBlockHeight,
      feePayer: this.wallet.publicKey,
    })

    legacyTransaction.add(...instructions)

    return legacyTransaction
  }

  async sendLegacyTransaction(tx: Transaction) {
    const txid = await this.connection.sendTransaction(tx, [this.wallet.payer], {
      skipPreflight: true,
    })

    return txid
  }

  async sendVersionedTransaction(tx: VersionedTransaction) {
    const txid = await this.connection.sendTransaction(tx, {
      skipPreflight: true,
    })

    return txid
  }

  async simulateLegacyTransaction(tx: Transaction) {
    const txid = await this.connection.simulateTransaction(tx, [this.wallet.payer])

    return txid
  }

  async simulateVersionedTransaction(tx: VersionedTransaction) {
    const txid = await this.connection.simulateTransaction(tx)

    return txid
  }

  getTokenAccountByOwnerAndMint(mint: PublicKey) {
    return {
      programId: TOKEN_PROGRAM_ID,
      pubkey: PublicKey.default,
      accountInfo: {
        mint: mint,
        amount: 0,
      },
    } as unknown as TokenAccount
  }

  async calcAmountOut(
    poolKeys: LiquidityPoolKeys,
    rawAmountIn: number,
    slippage: number = 5,
    swapInDirection: boolean
  ) {
    const poolInfo = await Liquidity.fetchInfo({ connection: this.connection, poolKeys })

    let currencyInMint = poolKeys.baseMint
    let currencyInDecimals = poolInfo.baseDecimals
    let currencyOutMint = poolKeys.quoteMint
    let currencyOutDecimals = poolInfo.quoteDecimals

    if (!swapInDirection) {
      currencyInMint = poolKeys.quoteMint
      currencyInDecimals = poolInfo.quoteDecimals
      currencyOutMint = poolKeys.baseMint
      currencyOutDecimals = poolInfo.baseDecimals
    }

    const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals)
    const amountIn = new TokenAmount(currencyIn, rawAmountIn.toFixed(currencyInDecimals), false)
    const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals)
    const slippageX = new Percent(slippage, 100) // 5% slippage

    const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut,
      slippage: slippageX,
    })

    return {
      amountIn,
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee,
    }
  }
}

export default RaydiumSwap