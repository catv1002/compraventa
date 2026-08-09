import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth-context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DailyClosePage } from './pages/DailyClosePage';
import { RangeReportPage } from './pages/RangeReportPage';
import { ImportPage } from './pages/ImportPage';
import { CustomersPage } from './pages/CustomersPage';
import { InventoryPage } from './pages/InventoryPage';
import { ContractsPage } from './pages/ContractsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CashPage } from './pages/CashPage';
import { CashStatementPage } from './pages/CashStatementPage';
import { ForfeiturePage } from './pages/ForfeiturePage';
import { BranchesPage } from './pages/BranchesPage';
import { WorkshopPage } from './pages/WorkshopPage';
import { LayawayPage } from './pages/LayawayPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { AccountingPage } from './pages/AccountingPage';
import { PurchaseAllowancesPage } from './pages/PurchaseAllowancesPage';
import { MfaSetupPage } from './pages/MfaSetupPage';
import { UsersPage } from './pages/UsersPage';
import { TenantConfigurationPage } from './pages/TenantConfigurationPage';
import { AuditLogPage } from './pages/AuditLogPage';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/cierre-del-dia" element={<DailyClosePage />} />
                <Route path="/reportes" element={<RangeReportPage />} />
                <Route path="/migracion" element={<ImportPage />} />
                <Route path="/clientes" element={<CustomersPage />} />
                <Route path="/inventario" element={<InventoryPage />} />
                <Route path="/contratos" element={<ContractsPage />} />
                <Route path="/cobro" element={<PaymentsPage />} />
                <Route path="/plan-separe" element={<LayawayPage />} />
                <Route path="/taller" element={<WorkshopPage />} />
                <Route path="/caja" element={<CashPage />} />
                <Route path="/cupo-compra" element={<PurchaseAllowancesPage />} />
                <Route path="/libro-caja" element={<CashStatementPage />} />
                <Route path="/remate" element={<ForfeiturePage />} />
                <Route path="/cartera" element={<CollectionsPage />} />
                <Route path="/contabilidad" element={<AccountingPage />} />
                <Route path="/sucursales" element={<BranchesPage />} />
                <Route path="/usuarios" element={<UsersPage />} />
                <Route path="/configuracion" element={<TenantConfigurationPage />} />
                <Route path="/auditoria" element={<AuditLogPage />} />
                <Route path="/perfil/mfa" element={<MfaSetupPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
