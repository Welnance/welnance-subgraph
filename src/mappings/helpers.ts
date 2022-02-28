/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { BigDecimal, BigInt, Bytes, Address } from '@graphprotocol/graph-ts'
import { AccountWLToken, Account, AccountWLTokenTransaction } from '../types/schema'

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export let mantissaFactor = 18
export let wlTokenDecimals = 8
export let mantissaFactorBD: BigDecimal = exponentToBigDecimal(18)
export let wlTokenDecimalsBD: BigDecimal = exponentToBigDecimal(8)
export let zeroBD = BigDecimal.fromString('0')

export function createAccountWLToken(
  wlTokenStatsID: string,
  symbol: string,
  account: string,
  marketID: string,
): AccountWLToken {
  let wlTokenStats = new AccountWLToken(wlTokenStatsID)
  wlTokenStats.symbol = symbol
  wlTokenStats.market = marketID
  wlTokenStats.account = account
  wlTokenStats.accrualBlockNumber = BigInt.fromI32(0)
  wlTokenStats.wlTokenBalance = zeroBD
  wlTokenStats.totalUnderlyingSupplied = zeroBD
  wlTokenStats.totalUnderlyingRedeemed = zeroBD
  wlTokenStats.accountBorrowIndex = zeroBD
  wlTokenStats.totalUnderlyingBorrowed = zeroBD
  wlTokenStats.totalUnderlyingRepaid = zeroBD
  wlTokenStats.storedBorrowBalance = zeroBD
  wlTokenStats.enteredMarket = false
  return wlTokenStats
}

export function createAccount(accountID: string): Account {
  let account = new Account(accountID)
  account.countLiquidated = 0
  account.countLiquidator = 0
  account.hasBorrowed = false
  account.save()
  return account
}

export function updateCommonWLTokenStats(
  marketID: string,
  marketSymbol: string,
  accountID: string,
  tx_hash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
): AccountWLToken {
  let wlTokenStatsID = marketID.concat('-').concat(accountID)
  let wlTokenStats = AccountWLToken.load(wlTokenStatsID)
  if (wlTokenStats == null) {
    wlTokenStats = createAccountWLToken(wlTokenStatsID, marketSymbol, accountID, marketID)
  }
  getOrCreateAccountWLTokenTransaction(
    wlTokenStatsID,
    tx_hash,
    timestamp,
    blockNumber,
    logIndex,
  )
  wlTokenStats.accrualBlockNumber = blockNumber
  return wlTokenStats as AccountWLToken
}

export function getOrCreateAccountWLTokenTransaction(
  accountID: string,
  tx_hash: Bytes,
  timestamp: BigInt,
  block: BigInt,
  logIndex: BigInt,
): AccountWLTokenTransaction {
  let id = accountID
    .concat('-')
    .concat(tx_hash.toHexString())
    .concat('-')
    .concat(logIndex.toString())
  let transaction = AccountWLTokenTransaction.load(id)

  if (transaction == null) {
    transaction = new AccountWLTokenTransaction(id)
    transaction.account = accountID
    transaction.tx_hash = tx_hash
    transaction.timestamp = timestamp
    transaction.block = block
    transaction.logIndex = logIndex
    transaction.save()
  }

  return transaction as AccountWLTokenTransaction
}
