import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Coins, LCDClient, RawKey, StdFee } from '@terra-money/terra.js'
import { StdSignMsg, StdTx } from '@terra-money/terra.js'
import { ConfirmProps, ConfirmPage, Sign, Field, User } from '../types'
import { PostResult } from '../types'
import useInfo from '../lang/useInfo'
import fcd from '../api/fcd'
import { format } from '../utils'
import { toInput, toAmount } from '../utils/format'
import { times, lt, gt } from '../utils/math'
import { getStoredWallet } from '../../../utils/localStorage'
import * as ledgers from '../../../wallet/ledger'
import { useConfig } from '../contexts/ConfigContext'
import LedgerKey from '../../../extension/LedgerKey'
import { getBase, config, useCalcFee } from './txHelpers'
import { checkError, parseError } from './txHelpers'

interface SignParams {
  user: User
  password?: string
  sign: Sign
}

export default (
  { url, payload, memo, submitLabels, message, ...rest }: ConfirmProps,
  { user, password: defaultPassword = '', sign }: SignParams
): ConfirmPage => {
  const { contents, msgs, tax, feeDenom, validate, warning, parseResult } = rest

  const { t } = useTranslation()
  const { ERROR } = useInfo()
  const { address, name, ledger } = user

  const SUCCESS = {
    title: t('Post:Confirm:Success!'),
    button: t('Common:Form:Ok'),
  }

  /* error */
  const defaultErrorMessage = t('Common:Error:Oops! Something went wrong')
  const [simulatedErrorMessage, setSimulatedErrorMessage] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const { chain } = useConfig()
  const { chainID, lcd: URL } = chain.current

  /* fee */
  const getFeeDenom = (amount: string) => {
    const { defaultValue, list } = feeDenom
    const available = list.filter((denom) => validate({ amount, denom }))
    // People would prefer other denoms for paying fee
    const availablePref: string[] = available.filter((d) => d !== denom)
    return availablePref[0] ?? defaultValue ?? available[0]
  }

  const [input, setInput] = useState<string>(toInput('1'))
  const [denom, setDenom] = useState<string>(getFeeDenom('1'))
  const [estimated, setEstimated] = useState<string>()
  const fee = { amount: toAmount(input), denom }
  const calcFee = useCalcFee(denom)
  const readyToSimulate = !!calcFee

  /* simulate */
  const [simulating, setSimulating] = useState(true)
  const [simulated, setSimulated] = useState(false)
  const [unsignedTx, setUnsignedTx] = useState<StdSignMsg>()
  const [gas, setGas] = useState('0')
  const isGasEstimated = gt(gas, 0)

  useEffect(() => {
    isGasEstimated && calcFee && setDenom(getFeeDenom(calcFee.gasFee(gas)))
    // eslint-disable-next-line
  }, [isGasEstimated, readyToSimulate])

  useEffect(() => {
    const simulate = async () => {
      try {
        setSimulated(false)
        setSimulating(true)
        setEstimated(undefined)
        setErrorMessage(undefined)

        if (msgs) {
          const { gasPrice } = calcFee!
          const gasPrices = { [denom]: gasPrice }
          const lcd = new LCDClient({ chainID, URL, gasPrices })
          const options = { msgs, feeDenoms: [denom], memo }
          const unsignedTx = await lcd.tx.create(user.address, options)
          setUnsignedTx(unsignedTx)

          const gas = String(unsignedTx.fee.gas)
          const estimatedGasFee = calcFee!.gasFee(gas)
          setGas(gas)
          setInput(toInput(estimatedGasFee ?? '0'))
          setEstimated(estimatedGasFee)
          setSimulated(true)
        } else if (url) {
          // Simulate with initial fee
          const base = await getBase(address)
          const fees = [{ ...fee, amount: '0' }]
          const req = { simulate: true, gas: 'auto', fees, memo }
          const body = { base_req: { ...base, ...req }, ...payload }

          type Data = { gas_estimate: string }
          const { data } = await fcd.post<Data>(url, body, config)
          const feeAmount = calcFee!.gasFee(times(data.gas_estimate, 1.75))

          // Set simulated fee
          setInput(toInput(feeAmount))
          setEstimated(feeAmount)
          setSimulated(true)
        }
      } catch (error) {
        setSimulatedErrorMessage(parseError(error, defaultErrorMessage))
      } finally {
        setSimulating(false)
      }
    }

    readyToSimulate && simulate()

    // eslint-disable-next-line
  }, [denom, readyToSimulate])

  /* submit */
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<PostResult>()

  const submit = async () => {
    try {
      setLedgerError(undefined)
      setSubmitting(true)
      setErrorMessage(undefined)

      if (unsignedTx) {
        const broadcast = async (signedTx: StdTx) => {
          const { gasPrices } = calcFee!
          const lcd = new LCDClient({ chainID, URL, gasPrices })

          const data = await lcd.tx.broadcast(signedTx)
          setResult(data)

          // Catch error
          const errorMessage = checkError(data.raw_log)
          errorMessage ? setErrorMessage(errorMessage) : setSubmitted(true)
        }

        const gasFee = new Coins({ [fee.denom]: fee.amount })
        const fees = tax ? gasFee.add(tax) : gasFee
        unsignedTx.fee = new StdFee(unsignedTx.fee.gas, fees)

        if (user.ledger) {
          const key = new LedgerKey(await ledgers.getPubKey())
          const signed = await key.signTx(unsignedTx)
          await broadcast(signed)
        } else if (name) {
          const { privateKey } = getStoredWallet(name, password)
          const key = new RawKey(Buffer.from(privateKey, 'hex'))
          const signed = await key.signTx(unsignedTx)
          await broadcast(signed)
        }
      } else if (url) {
        // Post to fetch tx
        const gas_prices = [{ amount: calcFee!.gasPrice, denom: fee.denom }]
        const gas = calcFee!.gasFromFee(fee.amount)
        const base = await getBase(address)
        const req = { simulate: false, gas, gas_prices, memo }
        const body = { base_req: { ...base, ...req }, ...payload }

        type Data = { value: string }
        const { data } = await fcd.post<Data>(url, body, config)
        const { value: tx } = data

        // Post with signed tx
        const txURL = '/v1/txs'
        const signedTx = await sign({ tx, base, password })
        const result = await fcd.post<PostResult>(txURL, signedTx, config)
        setResult(result.data)

        // Catch error
        const errorMessage = checkError(result.data.raw_log)
        errorMessage ? setErrorMessage(errorMessage) : setSubmitted(true)
      }
    } catch (error) {
      error.message === 'Incorrect password'
        ? setPasswordError(t('Auth:Form:Incorrect password'))
        : error.message.includes('Signing failed: ')
        ? setLedgerError(error.message)
        : setErrorMessage(parseError(error, defaultErrorMessage))
    } finally {
      setSubmitting(false)
    }
  }

  const readyToSubmit = simulated && !submitting
  const valid = gt(fee.amount, 0) && validate(fee)

  /* ledger */
  const [confirming, setConfirming] = useState(false)
  const [ledgerError, setLedgerError] = useState<string>()

  /* password */
  const [password, setPassword] = useState(defaultPassword)
  const [passwordError, setPasswordError] = useState<string>()
  const passwordField: Field = {
    label: t('Post:Confirm:Confirm with password'),
    element: 'input',
    attrs: {
      type: 'password',
      id: 'password',
      disabled: !readyToSubmit || !valid,
      value: password,
      placeholder: t('Post:Confirm:Input your password to confirm'),
      autoComplete: 'off',
      autoFocus: true,
    },
    setValue: (v) => {
      setPasswordError(undefined)
      setPassword(v)
    },
    error: passwordError,
  }

  const disabled = !readyToSubmit || !valid || !(!name || password)
  const onSubmit = () => {
    ledger && setConfirming(true)
    submit()
  }

  return {
    contents,

    fee: {
      label: t('Common:Tx:Fee'),
      status: simulating ? t('Post:Confirm:Simulating...') : undefined,
      select: {
        options: feeDenom.list.map((denom) => ({
          value: denom,
          children: format.denom(denom),
          disabled: !validate({ amount: gas, denom }),
        })),
        attrs: { id: 'denom', value: denom, disabled: !readyToSubmit },
        setValue: (value: string) => setDenom(value),
      },
      input: {
        attrs: {
          id: 'input',
          value: input,
          disabled: !readyToSubmit || !denom,
        },
        setValue: (value: string) => setInput(value),
      },
      message:
        estimated && lt(fee.amount, estimated)
          ? t(
              'Post:Confirm:Recommended fee is {{fee}} or higher.\nTransactions with low fee might fail to proceed.',
              { fee: format.coin({ amount: estimated, denom: fee.denom }) }
            )
          : undefined,
    },

    form: {
      title: t('Common:Form:Confirm'),
      fields: name ? [passwordField] : [],
      errors: ([] as string[])
        .concat(warning ?? [])
        .concat(
          !valid
            ? t(
                "Post:Confirm:You don't have enough balance. Please adjust either the amount or the fee."
              )
            : []
        ),
      disabled,
      submitLabel: ledger
        ? t('Post:Confirm:Confirm with ledger')
        : submitting
        ? submitLabels[1]
        : submitLabels[0],
      onSubmit: disabled ? undefined : onSubmit,
      submitting,
    },

    ledger: confirming
      ? {
          card: {
            title: t('Post:Confirm:Confirm with ledger'),
            content: t('Post:Confirm:Please confirm in your\nLedger Wallet'),
          },
          retry: ledgerError
            ? {
                attrs: { onClick: submit, children: t('Common:Form:Retry') },
                message: ledgerError,
              }
            : undefined,
        }
      : undefined,

    result: simulatedErrorMessage
      ? { ...ERROR, content: simulatedErrorMessage }
      : errorMessage
      ? { ...ERROR, content: errorMessage }
      : submitted
      ? { ...SUCCESS, content: (result && parseResult?.(result)) ?? message }
      : undefined,
  }
}
