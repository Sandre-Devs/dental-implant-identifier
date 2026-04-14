import clsx from 'clsx'
export default function Spinner({ size='md', className }) {
  const s = { sm:'w-4 h-4', md:'w-6 h-6', lg:'w-10 h-10' }
  return <div className={clsx('animate-spin rounded-full border-2 border-gray-700 border-t-primary-500', s[size], className)}/>
}
