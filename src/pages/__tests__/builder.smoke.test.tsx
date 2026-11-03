import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import { resetMockBehavior, setMockBehavior } from '@/api/mockBehavior';
import { JourneyBuilderPage } from '../JourneyBuilderPage';
import { LandingPage } from '../LandingPage';

beforeEach(() => {
  resetMockBehavior();
  setMockBehavior({ latencyMs: 0 });
});

describe('builder smoke', () => {
  it('renders the workspace directory', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Passenger onboarding')).toBeInTheDocument();
    expect(screen.getByText('Driver availability announcement')).toBeInTheDocument();
  });

  it('loads the builder page with palette, canvas, and seeded journey', async () => {
    render(
      <MemoryRouter initialEntries={['/workspaces/ws_passenger_staging/journeys/journey_ps_onboarding']}>
        <Routes>
          <Route path="/workspaces/:workspaceId/journeys/:journeyId" element={<JourneyBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('Passenger onboarding')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Journey nodes' })).toBeInTheDocument();
    expect(screen.getByTestId('journey-canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publish/i })).toBeInTheDocument();
  });

  it('asks before leaving with unsaved changes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/workspaces/ws_passenger_staging/journeys/journey_ps_onboarding']}>
        <Routes>
          <Route path="/workspaces/:workspaceId/journeys/:journeyId" element={<JourneyBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByDisplayValue('Passenger onboarding');
    await user.click(screen.getByTestId('palette-action.sms'));
    await user.click(screen.getByRole('button', { name: /Back to journeys/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Discard unsaved changes/i);
    await user.click(screen.getByRole('button', { name: /Keep editing/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('loads a sandbox scenario and marks it as sandbox + read-only', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/workspaces/ws_passenger_staging/journeys/journey_ps_onboarding/demo?scenario=published-readonly',
        ]}
      >
        <Routes>
          <Route
            path="/workspaces/:workspaceId/journeys/:journeyId/demo"
            element={<JourneyBuilderPage sandbox />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText(/Sandbox/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Read-only/i).length).toBeGreaterThan(0);
  });
});
