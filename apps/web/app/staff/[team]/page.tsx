import { isTeam, TEAM_LABELS, TEAMS } from '@bell/core/taxonomy'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StaffDevTable } from '@/components/staff/staff-dev-table'

// The page shell has no data (the table loads and streams in the browser), so prerender each team.
export const generateStaticParams = () => TEAMS.map((team) => ({ team }))

export async function generateMetadata(props: PageProps<'/staff/[team]'>): Promise<Metadata> {
  const { team } = await props.params
  return { title: isTeam(team) ? `${TEAM_LABELS[team]} (dev view)` : 'Staff' }
}

export default async function StaffPage(props: PageProps<'/staff/[team]'>) {
  const { team } = await props.params
  if (!isTeam(team)) notFound()

  return <StaffDevTable team={team} />
}
