export interface BossProfile {
  id: string
  name: string
  role: string
  image: string
  parodyImage: string
}

export const bosses: BossProfile[] = [
  {
    id: 'priya',
    name: 'Priya S.',
    role: 'MDP, Strategy',
    image: '/img/boss-priya.svg',
    parodyImage: '/img/parody-priya.svg',
  },
  {
    id: 'arjun',
    name: 'Arjun M.',
    role: 'Partner, Growth',
    image: '/img/boss-arjun.svg',
    parodyImage: '/img/parody-arjun.svg',
  },
  {
    id: 'mei',
    name: 'Mei L.',
    role: 'Director of Ops',
    image: '/img/boss-mei.svg',
    parodyImage: '/img/parody-mei.svg',
  },
  {
    id: 'diego',
    name: 'Diego R.',
    role: 'CFO',
    image: '/img/boss-diego.svg',
    parodyImage: '/img/parody-diego.svg',
  },
]
