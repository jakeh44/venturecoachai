import { createFileRoute } from "@tanstack/react-router";

import { Hero, Nav, Problem, Philosophy, Roadmap, TrustStrip } from "~/components/landing/top";
import { Features, FinalCta, Footer, Pricing } from "~/components/landing/bottom";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <TrustStrip />
      <Problem />
      <Philosophy />
      <Roadmap />
      <Features />
      <Pricing />
      <FinalCta />
      <Footer />
    </main>
  );
}
