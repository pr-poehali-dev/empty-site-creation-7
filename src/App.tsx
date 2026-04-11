
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AuthorizeManager from "./pages/AuthorizeManager";
import ManagerDashboard from "./pages/ManagerDashboard";
import Catalog from "./pages/Catalog";
import WholesaleOrders from "./pages/WholesaleOrders";
import OrderItemsList from "./pages/OrderItemsList";
import ScanBarcode from "./pages/ScanBarcode";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/authorize/:id" element={<ProtectedRoute><AuthorizeManager /></ProtectedRoute>} />
          <Route path="/admin/manager" element={<ProtectedRoute><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/admin/catalog" element={<ProtectedRoute><Catalog /></ProtectedRoute>} />
          <Route path="/admin/orders" element={<ProtectedRoute><WholesaleOrders /></ProtectedRoute>} />
          <Route path="/admin/orders/new-list" element={<ProtectedRoute><OrderItemsList /></ProtectedRoute>} />
          <Route path="/admin/scan" element={<ProtectedRoute><ScanBarcode /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;