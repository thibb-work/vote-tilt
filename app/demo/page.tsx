import type { Metadata } from 'next';
import { DemoStage } from '@/components/DemoStage';

export const metadata: Metadata = {
  title: 'Tilt to vote — demo',
  description: 'Try the voting dial without a QR code.',
};

export default function DemoPage() {
  return <DemoStage />;
}
