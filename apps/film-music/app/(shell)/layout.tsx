import { UnifiedShellLayout } from '@/app/components/UnifiedShellLayout'

export default function ShellLayoutGroup({ children }: { children: React.ReactNode }) {
  return <UnifiedShellLayout>{children}</UnifiedShellLayout>
}
