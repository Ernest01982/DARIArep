import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { VisitStart } from './pages/VisitStart';
import { VisitClient } from './pages/VisitClient';
import { Order } from './pages/Order';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="visit" element={<VisitStart />} />
          <Route path="visit/client" element={<VisitClient />} />
          <Route path="order" element={<Order />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;