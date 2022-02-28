/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { Market, Comptroller } from '../types/schema'
import { PriceOracle } from '../types/templates/WLToken/PriceOracle'
import { BEP20 } from '../types/templates/WLToken/BEP20'
import { WLToken } from '../types/templates/WLToken/WLToken'

import {
  exponentToBigDecimal,
  mantissaFactor,
  mantissaFactorBD,
  wlTokenDecimalsBD,
  zeroBD,
} from './helpers'

// address to lowercase
let wlUSDTAddress = '0x781d0d50ae3683322090c54c25858bf76ec9f922'
// address to lowercase
let wlBNBAddress = '0x38e22c429e62530cbb59b90bf14a71346c727752'

// Used for all BEP20 contracts
function getTokenPrice(
  blockNumber: i32,
  eventAddress: Address,
  underlyingAddress: Address,
  underlyingDecimals: i32,
): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let underlyingPrice: BigDecimal

  /* PriceOracle2 is used from starting of Comptroller.
   * This must use the wlToken address.
   *
   * Note this returns the value without factoring in token decimals and wei, so we must divide
   * the number by (bnbDecimals - tokenDecimals) and again by the mantissa.
   */
  let mantissaDecimalFactor = 18 - underlyingDecimals + 18
  let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
  let oracle = PriceOracle.bind(oracleAddress)
  underlyingPrice = oracle
    .getUnderlyingPrice(eventAddress)
    .toBigDecimal()
    .div(bdFactor)
  return underlyingPrice
}

export function createMarket(marketAddress: string): Market {
  let market: Market
  let contract = WLToken.bind(Address.fromString(marketAddress))
  log.info(`marketID xxx -> ` + marketAddress, [])
  // It is vBNB, which has a slightly different interface
  if (marketAddress == wlBNBAddress) {
    market = new Market(marketAddress)
    market.underlyingAddress = Address.fromString(
      '0x0000000000000000000000000000000000000000',
    )
    market.underlyingDecimals = 18
    market.underlyingPrice = BigDecimal.fromString('1')
    market.underlyingName = 'Wrapped BNB'
    market.underlyingSymbol = 'BNB'
    market.underlyingPriceUSD = zeroBD
    // It is all other BEP20 contracts
  } else {
    market = new Market(marketAddress)
    market.underlyingAddress = contract.underlying()
    let underlyingContract = BEP20.bind(market.underlyingAddress as Address)
    market.underlyingDecimals = underlyingContract.decimals()
    market.underlyingName = underlyingContract.name()
    market.underlyingSymbol = underlyingContract.symbol()
    market.underlyingPriceUSD = zeroBD
    market.underlyingPrice = zeroBD
    if (marketAddress == wlUSDTAddress) {
      market.underlyingPriceUSD = BigDecimal.fromString('1')
    }
  }

  let interestRateModelAddress = contract.try_interestRateModel()
  let reserveFactor = contract.try_reserveFactorMantissa()

  market.borrowRate = zeroBD
  market.cash = zeroBD
  market.collateralFactor = zeroBD
  market.exchangeRate = zeroBD
  market.interestRateModelAddress = interestRateModelAddress.reverted
    ? Address.fromString('0x0000000000000000000000000000000000000000')
    : interestRateModelAddress.value
  market.name = contract.name()
  market.reserves = zeroBD
  market.supplyRate = zeroBD
  market.symbol = contract.symbol()
  market.totalBorrows = zeroBD
  market.totalSupply = zeroBD

  market.accrualBlockNumber = 0
  market.blockTimestamp = 0
  market.borrowIndex = zeroBD
  market.reserveFactor = reserveFactor.reverted ? BigInt.fromI32(0) : reserveFactor.value

  return market
}

function getBNBinUSD(blockNumber: i32): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let oracle = PriceOracle.bind(oracleAddress)
  let bnbPriceInUSD = oracle
    .getUnderlyingPrice(Address.fromString(wlBNBAddress))
    .toBigDecimal()
    .div(mantissaFactorBD)
  return bnbPriceInUSD
}

export function updateMarket(
  marketAddress: Address,
  blockNumber: i32,
  blockTimestamp: i32,
): Market {
  let marketID = marketAddress.toHexString()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(marketID)
  }

  // Only updateMarket if it has not been updated this block
  if (market.accrualBlockNumber != blockNumber) {
    let contractAddress = Address.fromString(market.id)
    let contract = WLToken.bind(contractAddress)

    let bnbPriceInUSD = getBNBinUSD(blockNumber)

    // if aBNB, we only update USD price
    if (market.id == wlBNBAddress) {
      market.underlyingPriceUSD = bnbPriceInUSD.truncate(market.underlyingDecimals)
    } else {
      let tokenPriceUSD = getTokenPrice(
        blockNumber,
        contractAddress,
        market.underlyingAddress as Address,
        market.underlyingDecimals,
      )

      market.underlyingPrice = tokenPriceUSD
        .div(bnbPriceInUSD)
        .truncate(market.underlyingDecimals)
      // if USDT, we only update BNB price
      if (market.id != wlUSDTAddress) {
        market.underlyingPriceUSD = tokenPriceUSD.truncate(market.underlyingDecimals)
      }
    }

    market.accrualBlockNumber = contract.accrualBlockNumber().toI32()
    market.blockTimestamp = blockTimestamp
    market.totalSupply = contract
      .totalSupply()
      .toBigDecimal()
      .div(wlTokenDecimalsBD)

    /* Exchange rate explanation
       In Practice
        - If you call the vDAI contract on bscscan it comes back (2.0 * 10^26)
        - If you call the wlUSDT contract on bscscan it comes back (2.0 * 10^14)
        - The real value is ~0.02. So vDAI is off by 10^28, and wlUSDT 10^16
       How to calculate for tokens with different decimals
        - Must div by tokenDecimals, 10^market.underlyingDecimals
        - Must multiply by wlTokenDecimals, 10^8
        - Must div by mantissa, 10^18
     */
    market.exchangeRate = contract
      .exchangeRateStored()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .times(wlTokenDecimalsBD)
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)
    market.borrowIndex = contract
      .borrowIndex()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    market.reserves = contract
      .totalReserves()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.totalBorrows = contract
      .totalBorrows()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.cash = contract
      .getCash()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Welnance Solidity
    market.borrowRate = contract
      .borrowRatePerBlock()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    // This fails on only the first call to cZRX. It is unclear why, but otherwise it works.
    // So we handle it like this.
    let supplyRatePerBlock = contract.try_supplyRatePerBlock()
    if (supplyRatePerBlock.reverted) {
      log.info('***CALL FAILED*** : BEP20 supplyRatePerBlock() reverted', [])
      market.supplyRate = zeroBD
    } else {
      market.supplyRate = supplyRatePerBlock.value
        .toBigDecimal()
        .div(mantissaFactorBD)
        .truncate(mantissaFactor)
    }
    market.save()
  }

  return market as Market
}
