import type { Metadata } from 'next';
import AcceptInviteClient from './AcceptInviteClient';

// OG metadata so WhatsApp / iMessage / Slack render a link card with
// our app's name + icon instead of a bare URL. Without this the share
// experience looks broken-ish even when it's working fine.
export async function generateMetadata(): Promise<Metadata> {
  const title = 'Join my grocery list';
  const description = 'Tap to view and edit our shared grocery list.';
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: ['/icon.png'],
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    robots: { index: false, follow: false },
  };
}

export default async function ShareGroceryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptInviteClient token={token} />;
}
