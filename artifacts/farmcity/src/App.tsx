import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { AuthProvider } from '@/contexts/auth-context';
import { LanguageProvider } from '@/contexts/language-context';
import { AuthWrapper } from '@/components/auth-wrapper';

import Loading from '@/pages/loading';
import Home from '@/pages/home';
import AvatarCreator from '@/pages/avatar';
import Plaza from '@/pages/plaza';
import RoomEditor from '@/pages/room-editor';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/loading" component={Loading} />
      <Route path="/" component={Home} />
      <Route path="/avatar" component={AvatarCreator} />
      <Route path="/plaza" component={Plaza} />
      <Route path="/room-editor" component={RoomEditor} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <LanguageProvider>
            <AuthWrapper>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <Router />
              </WouterRouter>
              <Toaster />
            </AuthWrapper>
          </LanguageProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
