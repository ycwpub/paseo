import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { WorkflowsScreen } from "@/screens/workflows-screen";

export default function WorkflowsRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <WorkflowsScreen />
    </HostRouteBootstrapBoundary>
  );
}
