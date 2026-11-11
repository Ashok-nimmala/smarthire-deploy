import { Navigate, useLocation } from "react-router-dom";
import { getSession } from "../api";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!getSession()) {
    return <Navigate to="/interviewer/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
