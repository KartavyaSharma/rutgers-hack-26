import { CHART_OPTIONS, type OptionId, REQUEST_GROUPS, type RequestOption } from '@bell/core/taxonomy'
import { fillText, GROUP_ICON, type IconName, type Translate } from '@bell/ui'
import type { Chart } from './chart'

// The eight category buttons, their options, and the chart rules that change them (from the
// Bell Patient Tablet artboard). Patient words only; the team for each option stays in core.

export interface PatientOption {
  /** Request kind, e.g. "food.water". */
  id: OptionId
  label: string
  /** Short second line. */
  sub: string
}

export interface Category {
  id: string
  label: string
  /** Examples under the label on the home button. */
  examples: string
  icon: IconName
  options: readonly PatientOption[]
}

// Built from the shared request catalog in @bell/core, so the tablet, Jev and staff share one list.
const toOption = (o: RequestOption & { id: OptionId }): PatientOption => ({
  id: o.id,
  label: o.label,
  sub: o.sub,
})

export const CATEGORIES: readonly Category[] = REQUEST_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  examples: group.hint ?? '',
  icon: GROUP_ICON[group.id],
  options: group.requests.map(toOption),
}))

/** While fasting, the food screen offers only these. */
const FASTING_OPTIONS: readonly PatientOption[] = CHART_OPTIONS.map(toOption)

export const categoryById = (id: string): Category | null =>
  CATEGORIES.find((c) => c.id === id) ?? null

/** What a category screen shows for this chart. */
export interface CategoryScreen {
  options: readonly PatientOption[]
  /** A lock note: options were left out, or need a warning. */
  notice?: { title: string; body: string }
  /** Quiet tags when menus were only filtered, e.g. "Low sugar diet", "No peanuts". */
  tags?: readonly string[]
}

const ML_PER_CUP = 240
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const foodScreen = (category: Category, chart: Chart, t: Translate): CategoryScreen => {
  // Nothing by mouth: the eating and drinking options are gone, three safe ones are left.
  if (chart.npo) {
    return {
      options: FASTING_OPTIONS,
      notice: { title: t(chart.npo.title), body: t(chart.npo.reason) },
    }
  }
  const filtered = chart.diet !== undefined || chart.foodAllergies.length > 0
  const options = category.options.map((o) => {
    if (chart.fluidLimitMl !== undefined) {
      if (o.id === 'food.water') return { ...o, sub: t('A small cup') }
      if (o.id === 'food.ice') return { ...o, sub: t('Ice chips, a small cup') }
    }
    if (filtered && o.id === 'food.snack') return { ...o, sub: t('Only what fits your diet') }
    if (filtered && o.id === 'food.meal') return { ...o, sub: t('From your own menu') }
    return o
  })
  const tags = [
    ...(chart.diet ? [t(chart.diet)] : []),
    ...chart.foodAllergies.map((a) => t('No {food}', { food: t(a) })),
  ]
  return {
    options,
    ...(chart.fluidLimitMl !== undefined
      ? {
          notice: {
            title: t('Drinks are limited to about {n} cups a day', {
              n: Math.round(chart.fluidLimitMl / ML_PER_CUP),
            }),
            body: t('Ice counts too.'),
          },
        }
      : tags.length > 0
        ? { tags: tags.map(capitalize) }
        : {}),
  }
}

/**
 * The options a category screen shows, after the chart rules. Hidden options are left out,
 * not crossed out; they are still reachable by voice, which goes to the nurse.
 */
export const screenFor = (
  category: Category,
  chart: Chart,
  t: Translate = fillText,
): CategoryScreen => {
  if (category.id === 'food') return foodScreen(category, chart, t)
  if (chart.fallRisk && (category.id === 'move' || category.id === 'bathroom')) {
    return {
      options: category.options,
      notice: {
        title: t('Please wait for help before you get up'),
        body: t('Someone will come every time. It keeps you from falling.'),
      },
    }
  }
  return { options: category.options }
}
