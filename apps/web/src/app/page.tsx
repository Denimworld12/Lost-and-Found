import { ContractCard } from "@/components/home/contract-card";
import { HomeHero } from "@/components/home/home-hero";
import { RecentItems } from "@/components/home/recent-items";
import { StepCard } from "@/components/home/step-card";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-64 pb-64">
      <HomeHero />
      <RecentItems />
      <section aria-labelledby="how-title" className="bg-white py-64">
        <div className="page-x flex flex-col gap-32">
          <h2
            id="how-title"
            className="text-heading-sm text-abyss md:text-heading"
          >
            How a return works
          </h2>
          <ol className="grid gap-24 md:grid-cols-3">
            <StepCard step={1} tag="Owner" title="Post and lock a reward">
              Describe what you lost and lock a reward in test ETH. It stays in
              the contract, not with anyone.
            </StepCard>
            <StepCard
              step={2}
              tag="Finder"
              title="A student claims and meets you"
            >
              The finder locks a small deposit and you get each other&apos;s
              college email to arrange the handover.
            </StepCard>
            <StepCard
              step={3}
              tag="Owner"
              title="Confirm, and the finder is paid"
            >
              Once it&apos;s back, confirm the return. The finder gets the
              reward plus their deposit.
            </StepCard>
          </ol>
        </div>
      </section>
      <ContractCard />
    </div>
  );
}
