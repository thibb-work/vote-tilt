import { HostBoard } from '@/components/HostBoard';
import { HostLogin } from '@/components/HostLogin';
import { isHost } from '@/lib/hostAuth';

// The cookie decides what renders, so this can never be cached.
export const dynamic = 'force-dynamic';

export default async function HostPage() {
  return (await isHost()) ? <HostBoard /> : <HostLogin />;
}
