import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PortalTabs } from "@/components/PortalTabs";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <PortalTabs />
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
