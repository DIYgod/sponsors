import { readFile } from 'node:fs/promises'
import { defineConfig, ProvidersMap, tierPresets } from 'sponsorkit'
import type { Provider, ProviderName, Sponsorship } from 'sponsorkit'

type FetchSponsors = Provider['fetchSponsors']
type LoadFallbackSponsors = () => Promise<Sponsorship[]>

const fallbackSponsorsFile = new URL('./sponsors.json', import.meta.url)

export async function loadOpenCollectiveFallbackSponsors(): Promise<Sponsorship[]> {
  const sponsors = JSON.parse(await readFile(fallbackSponsorsFile, 'utf8')) as Sponsorship[]

  if (!Array.isArray(sponsors))
    return []

  return sponsors
    .filter(sponsor => sponsor.provider === 'opencollective')
    .map((sponsor) => {
      const {
        avatarBuffer: _avatarBuffer,
        avatarUrlHighRes: _avatarUrlHighRes,
        avatarUrlMediumRes: _avatarUrlMediumRes,
        avatarUrlLowRes: _avatarUrlLowRes,
        ...sponsorInfo
      } = sponsor.sponsor as Sponsorship['sponsor'] & Record<string, unknown>

      return {
        ...sponsor,
        sponsor: sponsorInfo,
      }
    })
}

export function createOpenCollectiveProvider(
  fetchSponsors: FetchSponsors = ProvidersMap.opencollective.fetchSponsors,
  loadFallbackSponsors: LoadFallbackSponsors = loadOpenCollectiveFallbackSponsors,
): Provider {
  return {
    name: 'opencollective',
    async fetchSponsors(config) {
      try {
        return await fetchSponsors(config)
      }
      catch (error) {
        console.warn(`[sponsors] Failed to fetch OpenCollective sponsors: ${error instanceof Error ? error.message : String(error)}`)
        console.warn('[sponsors] Reusing OpenCollective entries from sponsors.json')
        return loadFallbackSponsors()
      }
    },
  }
}

function hasEnv(...names: string[]): boolean {
  return names.some(name => !!process.env[name])
}

function createProviders(): (ProviderName | Provider)[] | undefined {
  const providers: (ProviderName | Provider)[] = []

  if (hasEnv('SPONSORKIT_GITHUB_LOGIN', 'GITHUB_LOGIN', 'SPONSORKIT_LOGIN'))
    providers.push('github')

  if (hasEnv('SPONSORKIT_PATREON_TOKEN', 'PATREON_TOKEN'))
    providers.push('patreon')

  if (
    hasEnv('SPONSORKIT_OPENCOLLECTIVE_KEY', 'OPENCOLLECTIVE_KEY')
    && (
      hasEnv('SPONSORKIT_OPENCOLLECTIVE_ID', 'OPENCOLLECTIVE_ID')
      || hasEnv('SPONSORKIT_OPENCOLLECTIVE_SLUG', 'OPENCOLLECTIVE_SLUG')
      || hasEnv('SPONSORKIT_OPENCOLLECTIVE_GH_HANDLE', 'OPENCOLLECTIVE_GH_HANDLE')
    )
  ) {
    providers.push(createOpenCollectiveProvider())
  }

  if (
    hasEnv('SPONSORKIT_AFDIAN_USER_ID', 'AFDIAN_USER_ID')
    && hasEnv('SPONSORKIT_AFDIAN_TOKEN', 'AFDIAN_TOKEN')
  ) {
    providers.push('afdian')
  }

  return providers.length ? providers : undefined
}

const providers = createProviders()
const sharedConfig = {
  formats: ['svg', 'json'] as const,
  afdian: {
    exchangeRate: 740,
  },
  providers,
}

// @ts-ignore
export default defineConfig(process.env.SPONSORKIT_TYPE === 'simple' ? {
  ...sharedConfig,
  tiers: [
    {
      preset: tierPresets.xs,
    },
    {
      monthlyDollars: -1,
      preset: tierPresets.xs,
    },
  ],
} : {
  ...sharedConfig,
  tiers: [
    {
      title: 'Past Sponsors',
      monthlyDollars: -1,
      preset: tierPresets.xs,
    },
    {
      title: 'Donors',
      preset: tierPresets.base,
    },
    {
      title: 'Patrons',
      monthlyDollars: 10,
      preset: {
        ...tierPresets.medium,
        name: {
          maxLength: 8,
        },
      },
    },
    {
      title: 'Benefactors',
      monthlyDollars: 100,
      preset: {
        ...tierPresets.large,
        name: {
          maxLength: 8,
        },
      },
    },
  ],
})
