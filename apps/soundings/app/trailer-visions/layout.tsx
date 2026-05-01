import NavBar from "./components/NavBar"

export default function TrailerVisionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar />
      {children}
    </div>
  )
}
