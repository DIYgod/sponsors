import { defineConfig, presets } from 'sponsorkit'

export default defineConfig({
  formats: ['svg', 'json'],
  afdian: {
    exechangeRate: 7.2,
  },
  tiers: [
    {
      title: 'Past Sponsors',
      monthlyDollars: -1,
      preset: presets.xs,
    },
    {
      title: 'Donors',
      preset: presets.base,
    },
    {
      title: 'Appreciators',
      monthlyDollars: 5,
      preset: presets.medium,
      composeAfter: (composer, tierSponsors, config) => {
        composer.addSpan(15)
      },
    },
    {
      title: 'Supporters',
      monthlyDollars: 8,
      preset: presets.large,
      composeAfter: (composer, tierSponsors, config) => {
        composer.addSpan(40)
      },
    },
  ],
})