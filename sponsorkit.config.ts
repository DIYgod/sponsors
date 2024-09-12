import { defineConfig, presets, BadgePreset } from 'sponsorkit'

const past: BadgePreset = {
  avatar: {
    size: 20,
  },
  boxWidth: 22,
  boxHeight: 22,
  container: {
    sidePadding: 35,
  },
}

export default defineConfig({
  formats: ['svg', 'json'],
  afdian: {
    exechangeRate: 740,
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
      title: 'Patrons',
      monthlyDollars: 10,
      preset: {
        ...presets.medium,
        name: {
          maxLength: 8,
        },
      },
    },
    {
      title: 'Benefactors',
      monthlyDollars: 100,
      preset: {
        ...presets.large,
        name: {
          maxLength: 8,
        },
      },
    },
  ],
})