import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, Button, Modal, Tooltip } from 'antd'
import { PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { u64 } from '@solana/spl-token'

import { FarmItem, FarmInfo, Quote, UserFarmInfo } from '@onesol/farm'

import { useOnesolFarmingProtocol } from '../../hooks/useOnesolFarmingProtocol'

import { AppBar } from '../appBar'
import Social from '../social'
import { Currency } from './currency'
import { TokenIcon } from '../tokenIcon'
import { NumericInput } from '../numericInput'

import { useCurrencyLeg } from '../../utils/currencyPair'
import {WRAPPED_SOL_MINT } from '../../utils/constant'
import { TokenInfo } from '../../utils/token-registry'
import { formatWithCommas } from '../../utils/utils'
import { convert } from '../../utils/utils'

import { useWallet } from '../../context/wallet'
import { useOnesolProtocol } from '../../hooks/useOnesolProtocol'

import { sendSignedTransactions } from '../../utils/pools'
import { useConnection } from '../../utils/connection'

import { notify } from '../../utils/notifications'

import './index.less'

type FarmParams = {
  id: string
}

interface FarmItemProps extends FarmItem {
  tvl: number
  apy: number
}

interface UserFarmInfoProps extends UserFarmInfo {
 pendingReward: bigint, 
 depositTokenAmount: bigint 
}

interface FarmInfoProps extends FarmInfo {
  lpTokenAmount: bigint
}

const Farm = () => {
  const { id } = useParams<FarmParams>()

  const { 
    farmMap, 
    getFarmInfo, 
    getUserFarmInfo,
    getEstimateAmount, 
    getFarmSwap,
    getDepositTransactions,
    getWithdrawTransactions,
    getHarvestTransactions,
    getRemoveLiquidityTransactions,
    getStakeTransactions 
  } = useOnesolFarmingProtocol()

  const farm: FarmItemProps = farmMap[id]
  const connection = useConnection()
  const { connect, connected, wallet } = useWallet()

  const { tokens } = useOnesolProtocol();

  const base = useCurrencyLeg();
  const setMintAddressA = base.setMint;

  const quote = useCurrencyLeg();
  const setMintAddressB = quote.setMint;

  const [rewardToken, setRewardToken] = useState<TokenInfo | null>(null)
  const [farmInfo, setFarmInfo] = useState<FarmInfoProps>()
  const [userFarmInfo, setUserFarmInfo] = useState<UserFarmInfoProps>()
  const [farmSwap, setFarmSwap] = useState<Quote>()
  const [pool, setPool] = useState<{tokenAAmount: string, tokenBAmount: string}>({
    tokenAAmount: '-',
    tokenBAmount: '-'
  })

  const [depositLoading, setDepositLoading] = useState(false)
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [harvestLoading, setHarvestLoading] = useState(false)
  const [removeLoading, setRemoveLoading] = useState(false)
  const [stakeLoading, setStakeLoading] = useState(false)

  const [visible, setVisible] = useState(false)
  const [amount, setAmount] = useState('')

  useEffect(() => {
    if (farm) {
      const { pool: { tokenA, tokenB } } = farm

      setMintAddressA(
        tokens.find((t: TokenInfo) => t.address === tokenA.mint.address.toBase58())?.address || ""
      );
      setMintAddressB(
        tokens.find((t: TokenInfo) => t.address === tokenB.mint.address.toBase58())?.address || ""
      );
    }
  }, [farm, tokens, setMintAddressA, setMintAddressB])

  useEffect(() => {
    if (farm && tokens.length) {
      const { rewardTokenMint: { address }} = farm

      const token = tokens.find((t: TokenInfo) => t.address === address.toBase58())

      setRewardToken(token)
    }
  }, [farm, tokens])

  const getSwap = useCallback(async () => {
    if (farm) {
      const {pool: { tokenA, tokenB }} = farm
      const swap: Quote = await getFarmSwap(farm)
      const  {tokenAAmount, tokenBAmount } = swap

      setFarmSwap(swap)

      setPool({
        tokenAAmount: `${formatWithCommas(convert(tokenAAmount.toNumber(), tokenA.mint.decimals))}`,
        tokenBAmount: `${formatWithCommas(convert(tokenBAmount.toNumber(), tokenB.mint.decimals))}`,
      })
    }
  }, [farm, getFarmSwap])

  useEffect(() => {
    getSwap()
  }, [farm, getSwap])

  const getFarm = useCallback(async () => {
    if (farm) {
      const info = await getFarmInfo(farm)

      setFarmInfo(info)
    }
  } , [farm, getFarmInfo])

  const getUserFarm = useCallback(async () => {
    if (connected && farm) {
        const info = await getUserFarmInfo(farm)

        setUserFarmInfo(info)

    }
  }, [connected, farm, getUserFarmInfo])

  useEffect(() => {
    if (farm) {
      getFarm()
    }
  }, [farm, getFarm])

  useEffect(() => {
    if (connected && farm) {
      getUserFarm()
    }
  }, [farm, connected, getUserFarm])

  const renderTitle = () => {
    if (!farm) {
      return null
    }

    return (
      <div className="farm">
        <div className='hd'>
          <div className="tokens">
            <div className="token">
              <TokenIcon
                style={{
                  width: '40px',
                  height: '40px',
                  margin: '0 -10px 0 0',
                  position: 'relative',
                  zIndex: 10
                }}
                mintAddress={base.mintAddress}
              />
            </div>
            <div className="token">
              <TokenIcon
                style={{ width: '40px', height: '40px', margin: '0' }}
                mintAddress={quote.mintAddress}
              />
            </div>
          </div>
          <div className="title">
            {base.name}-{quote.name}
          </div>
        </div>
        <div className='bd'>
          <div className="mod">
            <div className='hd'>Total staked</div>
            <div className='bd'>{ farm.tvl ? `$${formatWithCommas(farm.tvl, 2)}` : '-' }</div>
          </div>
          <div className="mod">
            <div className='hd'>APY</div>
            <div className='bd'>{ farm.apy ? `${formatWithCommas(farm.apy * 100, 2)}%` : '-' }</div>
          </div>
        </div>
      </div>
    )
  }

  const handleDeposit = useCallback(async () => {
    try {
      setDepositLoading(true)

      const transactions = await getDepositTransactions({
        farm,
        farmSwap,
        amountA: base.amount,
        amountB: quote.amount,
      })

      await sendSignedTransactions({
        connection,
        wallet,
        transactions,
      })

      farmSwap?.refresh()
      base.setAmount(`0`)
      quote.setAmount(`0`)

      getSwap()
      getFarm()
      getUserFarm()
    } catch (e) {
      notify({
        description: "Please try again and approve transactions from your wallet.",
        message: "Deposit trade cancelled.",
        type: "error",
      });
    } finally {
      setDepositLoading(false)
    }
  }, [farm, farmSwap, base, quote, getDepositTransactions, connection, wallet, getUserFarm, getFarm, getSwap])

  const handleWithdraw = useCallback(async () => {
    try {
      setWithdrawLoading(true)

      const transactions = await getWithdrawTransactions({
        farm,
        farmSwap,
        amount: new u64(Number(amount) * 10 ** farm.stakeTokenMint!.decimals),
      })

      await sendSignedTransactions({
        connection,
        wallet,
        transactions
      })

      setVisible(false)
      setAmount(`0.00`)

      getSwap()
      getFarm()
      getUserFarm()
    } catch (e) {
      notify({
        description: "Please try again and approve transactions from your wallet.",
        message: "Withdraw trade cancelled.",
        type: "error",
      });
    } finally {
      setWithdrawLoading(false)
    }
  }, [farm, farmSwap, getWithdrawTransactions, connection, wallet, getUserFarm, amount, getFarm, getSwap])

  const handleHarvest = useCallback(async () => {
    try {
      setHarvestLoading(true)

      const transactions = await getHarvestTransactions(farm)

      await sendSignedTransactions({
        connection,
        wallet,
        transactions
      })

      getSwap()
      getFarm()
      getUserFarm()
    } catch (e) {
      notify({
        description: "Please try again and approve transactions from your wallet.",
        message: "Harvest trade cancelled.",
        type: "error",
      });
    } finally {
      setHarvestLoading(false)
    }
  }, [connection, wallet, farm, getHarvestTransactions, getUserFarm, getFarm, getSwap])

  const handleRemove = useCallback(async () => {
    try {
      setRemoveLoading(true)

      const transactions = await getRemoveLiquidityTransactions(farm)

      await sendSignedTransactions({
        connection,
        wallet,
        transactions
      })

      getSwap()
      getFarm()
      getUserFarm()
    } catch (e) {
      notify({
        description: "Please try again and approve transactions from your wallet.",
        message: "Withdraw trade cancelled.",
        type: "error",
      });

    } finally {
      setRemoveLoading(false)
    }
  }, [getRemoveLiquidityTransactions, farm, wallet, connection, getSwap, getFarm, getUserFarm])

  const handleStake = useCallback(async () => {
    try {
      setStakeLoading(true)

      const transactions = await getStakeTransactions(farm)

      await sendSignedTransactions({
        connection,
        wallet,
        transactions
      })

      getSwap()
      getFarm()
      getUserFarm()
    } catch (e) {
      notify({
        description: "Please try again and approve transactions from your wallet.",
        message: "Stake trade cancelled.",
        type: "error",
      });
    } finally {
      setStakeLoading(false)
    }
  }, [getStakeTransactions, farm, wallet, connection, getSwap, getFarm, getUserFarm])

  const renderDeposit = () => {
    return (
      <div className="farm-deposit">
        <div className="hd">
          <Currency 
            mint={base.mintAddress} 
            amount={base.amount}
            onInputChange={ (val: number) => { 
              base.setAmount(`${val}`)
              
              const amount =  getEstimateAmount({ farmSwap, farm, amount: val })

              quote.setAmount(`${amount}`)
            }} 
            onMaxClick={ () => {
              const val = base.mintAddress === WRAPPED_SOL_MINT.toBase58() ? 
                base.balance - 0.05 > 0 ? base.balance - 0.05 : 0 : 
                base.balance

              base.setAmount(`${val}`)

              const amount = getEstimateAmount({ farmSwap, farm, amount: val })

              quote.setAmount(`${amount}`)
            }}
          />
          <div className="plus-icon">
            <PlusOutlined style={{fontSize: '18px'}} />
          </div>
          <Currency 
            mint={quote.mintAddress} 
            amount={quote.amount}
            onInputChange={ (val: number) => {
              quote.setAmount(`${val}`)
              
              const amount =  getEstimateAmount({ farmSwap, farm, amount: val, reverse: true})

              base.setAmount(`${amount}`)
            }} 
            onMaxClick={ () => {
              const val = quote.mintAddress === WRAPPED_SOL_MINT.toBase58() ? 
                quote.balance - 0.05 > 0 ? quote.balance - 0.05 : 0 : 
                quote.balance

              quote.setAmount(`${val}`)

              const amount =  getEstimateAmount({ farmSwap, farm, amount: val, reverse: true})

              base.setAmount(`${amount}`)
            }}
          />
        </div>
        <div className="ft">
          <Button
            disabled={
              connected && (
                depositLoading || 
                !base.amount || 
                !quote.amount || 
                Number(base.amount) > base.balance || 
                Number(quote.amount) > quote.balance
              )
            }
            loading={depositLoading}
            type="primary"
            size="large"
            shape="round"
            block
            onClick={connected ? handleDeposit : connect}
            style={{ marginTop: '20px' }}
          >
            {
              connected ? 
                Number(base.amount) > base.balance ?
                `Insufficient ${base.name} funds` :
                Number(quote.amount) > quote.balance ?
                `Insufficient ${quote.name} funds` :
                'Deposit' : 
              'Connect'
            }
          </Button>
        </div>
      </div>
    )
  }

  const renderLiquidity = () => {
    return (
      <div className="farm-liquidity">
        <div className="hd">Your Liquidity</div>
        <div className="bd">
          <Card
            className="liquidity-card"
            headStyle={{ padding: 0 }}
            bodyStyle={{ padding: '20px' }}
          >
            <div className='mod'>
              <div className='hd'>
                <div className='label'>Pending Rewards</div>
                <div className='value'>
                  { 
                    userFarmInfo ? 
                    formatWithCommas(convert(Number(userFarmInfo.pendingReward), farm.rewardTokenMint.decimals), 2) : 
                    0.00 
                  }
                  { rewardToken ? <span style={{marginLeft: '5px', fontSize: '12px'}}>{ rewardToken.symbol }</span> : ''}
                </div>
              </div>
              <div className='bd'>
                { 
                  userFarmInfo ?
                  <Button 
                    disabled={harvestLoading || !Number(userFarmInfo.pendingReward)}
                    loading={harvestLoading}
                    type='primary' 
                    onClick={handleHarvest}
                  >
                    Harvest
                  </Button> :
                  null
                }
              </div>
            </div>
            <div className='mod'>
              <div className='hd'>
                <div className='label'>Staked</div>
                <div className='value'>{ userFarmInfo ? formatWithCommas(convert(Number(userFarmInfo.stakeTokenAmount), farm.stakeTokenMint?.decimals), 2) : 0.00 } LP</div>
              </div>
              <div className='bd'>
                { 
                  userFarmInfo ?
                  <Button 
                    disabled={withdrawLoading || !Number(userFarmInfo.stakeTokenAmount)}
                    loading={withdrawLoading}
                    type='primary' 
                    onClick={() => setVisible(true)}
                  >
                    Withdraw
                  </Button> :
                  null
                }
              </div>
            </div>

            {
              userFarmInfo && Number(userFarmInfo.depositTokenAmount) ?
              <div className='mod'>
                <div className='hd'>
                  <div className='label'>
                    Deposited
                    <Tooltip title="Some are only deposited but not staked, so these aren't earning rewards now."><QuestionCircleOutlined style={{ marginLeft: '5px' }} /></Tooltip>
                  </div>
                  <div className='value'>{ userFarmInfo ? formatWithCommas(convert(Number(userFarmInfo.depositTokenAmount), farm.stakeTokenMint?.decimals), 2) : 0.00 } LP</div>
                </div>
                <div className='bd'>
                  <Button 
                    disabled={stakeLoading}
                    loading={stakeLoading}
                    type="primary" 
                    style={{ display: 'block', marginBottom: '5px' }} 
                    onClick={handleStake}
                  >
                    Stake
                  </Button>
                  <Button 
                    disabled={removeLoading}
                    loading={removeLoading}
                    type="link" 
                    size="small"
                    onClick={handleRemove}
                    style={{ fontSize: '12px' }}
                  >
                    Withdraw
                  </Button>
                </div>
              </div>
              : null
            }
          </Card>
        </div>
      </div>
    )
  }

  const renderPool = () => {
    return (
      <div className='farm-pool'>
        <div className='hd'>Pool</div>
        <div className='bd'>
          <Card
            className="liquidity-card"
            headStyle={{ padding: 0 }}
            bodyStyle={{ padding: '20px' }}
          >
            <div className='pool-mod'>
              <div className='hd'>
                Pooled {base.name.toUpperCase()}
              </div>
              <div className='bd'>{pool.tokenAAmount}</div>
            </div>
            <div className='pool-mod'>
              <div className='hd'>
                Pooled {quote.name.toUpperCase()}
              </div>
              <div className='bd'>{pool.tokenBAmount}</div>
            </div>
            <div className='pool-mod'>
              <div className='hd'>
                LP Supply
              </div>
              <div className='bd'>{farmInfo ? formatWithCommas(convert(Number(farmInfo.lpTokenAmount), farm.stakeTokenMint?.decimals)) : '-'}</div>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="page-farm">
      <AppBar />
      <div className="bd">
        {renderTitle()}
        <Card
          className="deposit-card"
          headStyle={{ padding: 0 }}
          bodyStyle={{ padding: '20px' }}
        >
          {renderDeposit()}
        </Card>
        {renderLiquidity()}
        {renderPool()}

        <Modal
          closable={false}
          visible={visible}
          confirmLoading={withdrawLoading}
          footer={[
            <Button onClick={() => {
              setAmount(`0.00`)
              setVisible(false)
            }}>Cancel</Button>,
            <Button 
              loading={withdrawLoading}
              disabled={
                withdrawLoading || 
                !Number(amount) || 
                (
                  userFarmInfo && 
                  convert(Number(userFarmInfo.stakeTokenAmount), farm.stakeTokenMint?.decimals) < parseFloat(amount)
                )
              } 
              type="primary" 
              onClick={handleWithdraw}
              style={{borderRadius: '0'}}
            >OK</Button>
          ]}
        >
          <div className='modal-unsake'>
            <div 
              className='hd'
              style={{
                marginTop: '0px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px'
              }}
            >
              <div className='label'>Balance:{ userFarmInfo ? convert(Number(userFarmInfo.stakeTokenAmount), farm.stakeTokenMint?.decimals) : 0.00 }</div>
              <Button 
                type="primary" 
                size="small" 
                onClick={() => {
                  setAmount( userFarmInfo ? `${convert(Number(userFarmInfo.stakeTokenAmount), farm.stakeTokenMint?.decimals)}` : '0.00' )
                }}
                style={{
                  fontSize: '10px',
                  borderRadius: '2px',
                  height: '20px',
                  padding: '2px 5px'
                }}
              >Max</Button>
            </div>
            <div 
              className='bd'
              style={{
                background: '#090f28',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                marginTop: '8px',
                padding: '10px',
                height: '50px'
              }}
            >
              <NumericInput
                value={amount}
                onChange={(val: any) => setAmount(val)}
                style={{
                  width: '100%',
                  fontSize: 18,
                  boxShadow: "none",
                  borderColor: "transparent",
                  outline: "transpaernt",
                  color: amount !== '0.00' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.3)'
                }}
                placeholder="0.00"
               />
            </div>
          </div>
        </Modal>
      </div>
      <Social />
    </div>
  )
}

export default Farm
