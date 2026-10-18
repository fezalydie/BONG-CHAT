/**
 * Story background presets.
 *
 * The values are complete Tailwind class lists so the compiler can see them as
 * literals. Building names dynamically (e.g. `from-${color}-500`) produces
 * classes Tailwind never generates, which is why they must live here verbatim.
 */
export const STORY_GRADIENTS: Record<string, string> = {
  sunset: 'bg-gradient-to-br from-amber-400 via-pink-500 to-rose-600',
  ocean: 'bg-gradient-to-br from-sky-400 via-brand-500 to-indigo-700',
  candy: 'bg-gradient-to-br from-pink-400 via-fuchsia-500 to-violet-600',
  aurora: 'bg-gradient-to-br from-emerald-400 via-teal-500 to-brand-600',
  grape: 'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-800',
  fire: 'bg-gradient-to-br from-yellow-400 via-orange-500 to-rose-600',
}

export const STORY_STYLES = Object.keys(STORY_GRADIENTS)

export function storyGradient(style: string): string {
  return STORY_GRADIENTS[style] ?? STORY_GRADIENTS.sunset
}
