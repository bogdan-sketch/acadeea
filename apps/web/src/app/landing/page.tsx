import { Hero } from '@/components/marketing/hero';
import { FeatureSections } from '@/components/marketing/feature-sections';
import { TenantBand } from '@/components/marketing/tenant-band';
import { Cta } from '@/components/marketing/cta';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <FeatureSections />
      <TenantBand />
      <Cta />
    </>
  );
}
