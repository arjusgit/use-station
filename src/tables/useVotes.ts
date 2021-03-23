import { useTranslation } from 'react-i18next'
import { Dictionary } from 'ramda'
import { VotesPage, VotesData, VoteItem } from '../types'
import { sum, toNumber } from '../utils'
import useFinder from '../hooks/useFinder'
import useFCD from '../api/useFCD'
import { getVoter } from '../pages/governance/helpers'

/** tabs */
export const useVoteOptions = (
  count: Dictionary<number>
): { key: string; label: string }[] => {
  const { Yes, No, NoWithVeto, Abstain } = count
  const total = toNumber(sum([Yes, No, NoWithVeto, Abstain]))
  const { t } = useTranslation()

  return [
    {
      key: '',
      label: `${t('Common:All')} (${total})`,
    },
    {
      key: 'Yes',
      label: `${t('Page:Governance:Yes')} (${Yes})`,
    },
    {
      key: 'No',
      label: `${t('Page:Governance:No')} (${No})`,
    },
    {
      key: 'NoWithVeto',
      label: `${t('Page:Governance:NoWithVeto')} (${NoWithVeto})`,
    },
    {
      key: 'Abstain',
      label: `${t('Page:Governance:Abstain')} (${Abstain})`,
    },
  ]
}

interface Params {
  id: string
  option: string
}

export default ({ id, option }: Params): VotesPage => {
  const { t } = useTranslation()
  const getLink = useFinder()

  /* api */
  const url = `/v1/gov/proposals/${id}/votes`
  const params = { option }
  const response = useFCD<VotesData>({ url, params })

  /* render */

  const render = ({ limit, votes }: VotesData) =>
    Object.assign(
      !votes.length
        ? {
            card: {
              content: t('Page:Governance:No votes yet'),
            },
          }
        : {
            table: {
              headings: {
                voter: t('Page:Governance:Voter'),
                answer: t('Page:Governance:Answer'),
              },
              contents: votes.map(({ voter, answer, txhash }: VoteItem) => ({
                voter: getVoter(voter, getLink),
                answer: t('Page:Governance:' + answer),
              })),
            },
          }
    )

  return Object.assign(
    { title: '' },
    response,
    response.data && { ui: render(response.data) }
  )
}
