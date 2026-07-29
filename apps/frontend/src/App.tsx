import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth-context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
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
import { MfaSetupPage } from './pages/MfaSetupPage';

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
                <Route path="/clientes" element={<CustomersPage />} />
                <Route path="/inventario" element={<InventoryPage />} />
                <Route path="/contratos" element={<ContractsPage />} />
                <Route path="/cobro" element={<PaymentsPage />} />
                <Route path="/plan-separe" element={<LayawayPage />} />
                <Route path="/taller" element={<WorkshopPage />} />
                <Route path="/caja" element={<CashPage />} />
                <Route path="/libro-caja" element={<CashStatementPage />} />
                <Route path="/remate" element={<ForfeiturePage />} />
                <Route path="/cartera" element={<CollectionsPage />} />
                <Route path="/contabilidad" element={<AccountingPage />} />
                <Route path="/sucursales" element={<BranchesPage />} />
                <Route path="/perfil/mfa" element={<MfaSetupPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
