import { defineConfig, tierPresets } from 'sponsorkit'

// @ts-expect-error process
export default defineConfig(process.env.TYPE = 'simple' ? {
  formats: ['svg', 'json'],
  afdian: {
    exechangeRate: 740,
  },
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
  formats: ['svg', 'json'],
  afdian: {
    exechangeRate: 740,
  },
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