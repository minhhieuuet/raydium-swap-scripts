import { ApiV3PoolInfoStandardItemCpmm, CpmmKeys, CpmmRpcData, CurveCalculator } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import { NATIVE_MINT } from '@solana/spl-token'
import { Connection, Keypair, clusterApiUrl, Signer, PublicKey, Transaction, SystemProgram } from '@solana/web3.js'
import { web3, Wallet } from "@project-serum/anchor";
import bs58 from 'bs58'
import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import 'dotenv/config'


export const owner: Keypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY as string))
export const connection = new Connection(process.env.RPC_URL) //<YOUR_RPC_URL>
// export const connection = new Connection(clusterApiUrl('devnet')) //<YOUR_RPC_URL>
export const txVersion = TxVersion.V0 // or TxVersion.LEGACY
const cluster = 'mainnet' // 'mainnet' | 'devnet'

let raydium: Raydium | undefined;

export const initSdk = async (params?: { loadToken?: boolean }) => {
  if (raydium) return raydium
  if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta'))
    console.warn('using free rpc node might cause unexpected error, strongly suggest uses paid rpc node')
  console.log(`connect to rpc ${connection.rpcEndpoint} in ${cluster}`)
  raydium = await Raydium.load({
    owner,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: 'finalized',
    // urlConfigs: {
    //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
    // },
  })

  /**
   * By default: sdk will automatically fetch token account data when need it or any sol balace changed.
   * if you want to handle token account by yourself, set token account data after init sdk
   * code below shows how to do it.
   * note: after call raydium.account.updateTokenAccount, raydium will not automatically fetch token account
   */

  /*  
  raydium.account.updateTokenAccount(await fetchTokenAccountData())
  connection.onAccountChange(owner.publicKey, async () => {
    raydium!.account.updateTokenAccount(await fetchTokenAccountData())
  })
  */

  return raydium
}


export const swap = async (walletAddress: string) => {
  try {
    const raydium = await initSdk()

    // SOL - NARA pool
    const poolId = 'DamLr7KDBKJLfcm4D4M4WqYXmPPdLGvvCr6KpE522HFq'
    const inputAmount = new BN('100')
    const inputMint = "So11111111111111111111111111111111111111112"

    let poolInfo: ApiV3PoolInfoStandardItemCpmm
    let poolKeys: CpmmKeys | undefined
    let rpcData: CpmmRpcData

    if (raydium.cluster === 'mainnet') {
      const data = await raydium.api.fetchPoolById({ ids: poolId })
      poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm
      // if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool')
      rpcData = await raydium.cpmm.getRpcPoolInfo(poolInfo.id, true)
    } else {
      const data = await raydium.cpmm.getPoolInfoFromRpc(poolId)
      poolInfo = data.poolInfo
      poolKeys = data.poolKeys
      rpcData = data.rpcData
    }

    if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address)
      throw new Error('input mint does not match pool')

    const baseIn = inputMint === poolInfo.mintA.address

    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swap(
      inputAmount,
      baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
      rpcData.configInfo!.tradeFeeRate
    )

    console.log(swapResult.destinationAmountSwapped.toString(), "++++++++++++")

    const { execute,   } = await raydium.cpmm.swap({
      poolInfo,
      poolKeys,
      inputAmount,
      swapResult,
      slippage: 0.001,
      baseIn,
      computeBudgetConfig: {
        units: 150000,
        microLamports: 121000,
      },
    })

    // printSimulateInfo()
    const { txId } = await execute({ sendAndConfirm: true })
    console.log(`swapped: ${poolInfo.mintA.symbol} to ${poolInfo.mintB.symbol}:`, {
      txId: `https://explorer.solana.com/tx/${txId}`,
    })

    const connection = new Connection(process.env.RPC_URL, "confirmed")
    const owner = Keypair.fromSecretKey(bs58.decode((process.env.WALLET_PRIVATE_KEY as string)))
    const wallet = new Wallet(owner)


    console.log("\n\n ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ \n\n")

    // process.exit() // if you don't want to end up node execution, comment this line
  } catch (error) {
    console.log(error)
  }
}

swap()
