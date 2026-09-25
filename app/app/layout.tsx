import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Your Project — DYE CUT LAB",
  description:
    "Tell DICI what you want to make — custom print and packaging in one conversation.",
};

export default function AppRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
