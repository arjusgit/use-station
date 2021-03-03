import { DisplayCoin } from '..'

export interface SwapUI {
  mode: string
  message: string
  expectedPrice?: {
    title: string
    text: string
  }
  max?: {
    title: string
    display: DisplayCoin
    attrs: { onClick: () => void }
  }
  spread?: {
    title: string
    text?: string
    value?: string
    unit?: string
    tooltip?: string
  }
}
