import { Footer, Nav } from "@/components/site/Nav";
import css from "@/components/site/site.module.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={css.page}>
      <Nav />
      <main className={css.main}>{children}</main>
      <Footer />
    </div>
  );
}
