import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../../../services/api'
import * as crmApi from '../crmApi'

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('crmApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET paths match the canonical contract', () => {
    it('getOverview', () => {
      crmApi.getOverview()
      expect(api.get).toHaveBeenCalledWith('/api/admin/crm/overview')
    })

    it('listFunnels', () => {
      crmApi.listFunnels()
      expect(api.get).toHaveBeenCalledWith('/api/admin/crm/funnels')
    })

    it('getFunnel', () => {
      crmApi.getFunnel('f1')
      expect(api.get).toHaveBeenCalledWith('/api/admin/crm/funnels/f1')
    })

    it('getLead', () => {
      crmApi.getLead('l1')
      expect(api.get).toHaveBeenCalledWith('/api/admin/crm/leads/l1')
    })

    it('listLeads serializes filters and drops empty/all values', () => {
      crmApi.listLeads({ search: 'jordan', status: 'active', source: 'all', funnel_id: '', page: 2 })
      const url = api.get.mock.calls[0][0]
      expect(url).toMatch(/^\/api\/admin\/crm\/leads\?/)
      expect(url).toContain('search=jordan')
      expect(url).toContain('status=active')
      expect(url).toContain('page=2')
      expect(url).not.toContain('source=')
      expect(url).not.toContain('funnel_id=')
    })

    it('listSuppressions', () => {
      crmApi.listSuppressions({ search: 'x', page: 1, limit: 25 })
      expect(api.get.mock.calls[0][0]).toMatch(/^\/api\/admin\/crm\/suppressions\?/)
    })
  })

  describe('every POST sends a body object (CSRF rule)', () => {
    const cases = [
      ['createFunnel', () => crmApi.createFunnel({ name: 'n' }), '/api/admin/crm/funnels'],
      ['setFunnelStatus', () => crmApi.setFunnelStatus('f1', 'paused'), '/api/admin/crm/funnels/f1/status'],
      ['createStep', () => crmApi.createStep('f1', { name: 's' }), '/api/admin/crm/funnels/f1/steps'],
      ['reorderSteps', () => crmApi.reorderSteps('f1', ['a', 'b']), '/api/admin/crm/funnels/f1/steps/reorder'],
      ['testSendStep', () => crmApi.testSendStep('s1', { subject: 'x' }), '/api/admin/crm/steps/s1/test-send'],
      ['createLead', () => crmApi.createLead({ email: 'a@b.c' }), '/api/admin/crm/leads'],
      ['convertLead', () => crmApi.convertLead('l1'), '/api/admin/crm/leads/l1/convert'],
      ['exitLead', () => crmApi.exitLead('l1'), '/api/admin/crm/leads/l1/exit'],
      ['moveLead', () => crmApi.moveLead('l1', { funnel_id: 'f1', step_order: 2 }), '/api/admin/crm/leads/l1/move'],
      ['addLeadNote', () => crmApi.addLeadNote('l1', 'hello'), '/api/admin/crm/leads/l1/notes'],
      ['addSuppression', () => crmApi.addSuppression({ email: 'a@b.c' }), '/api/admin/crm/suppressions'],
      ['runSweep', () => crmApi.runSweep(), '/api/admin/crm/sweep/run'],
    ]

    it.each(cases)('%s posts to the contract path with a defined body', (_name, call, path) => {
      call()
      expect(api.post).toHaveBeenCalledTimes(1)
      const [calledPath, body] = api.post.mock.calls[0]
      expect(calledPath).toBe(path)
      expect(body).toBeDefined()
      expect(typeof body).toBe('object')
      expect(body).not.toBeNull()
    })

    it('bodyless action POSTs still send an object', () => {
      crmApi.convertLead('l1')
      crmApi.exitLead('l1')
      crmApi.runSweep()
      api.post.mock.calls.forEach(([, body]) => {
        expect(body).toEqual({})
      })
    })

    it('setFunnelStatus carries the status', () => {
      crmApi.setFunnelStatus('f1', 'active')
      expect(api.post).toHaveBeenCalledWith('/api/admin/crm/funnels/f1/status', { status: 'active' })
    })

    it('reorderSteps carries the full ordered id list as step_ids', () => {
      crmApi.reorderSteps('f1', ['s2', 's1', 's3'])
      expect(api.post).toHaveBeenCalledWith('/api/admin/crm/funnels/f1/steps/reorder', {
        step_ids: ['s2', 's1', 's3'],
      })
    })

    it('moveLead carries funnel_id and step_order', () => {
      crmApi.moveLead('l1', { funnel_id: 'f9', step_order: 3 })
      expect(api.post).toHaveBeenCalledWith('/api/admin/crm/leads/l1/move', {
        funnel_id: 'f9',
        step_order: 3,
      })
    })

    it('addLeadNote wraps the text in {body}', () => {
      crmApi.addLeadNote('l1', 'call went well')
      expect(api.post).toHaveBeenCalledWith('/api/admin/crm/leads/l1/notes', { body: 'call went well' })
    })

    it('addSuppression defaults the reason to manual', () => {
      crmApi.addSuppression({ email: 'a@b.c' })
      expect(api.post).toHaveBeenCalledWith('/api/admin/crm/suppressions', {
        email: 'a@b.c',
        reason: 'manual',
      })
    })
  })

  describe('PUT and DELETE paths', () => {
    it('updateFunnel', () => {
      crmApi.updateFunnel('f1', { name: 'n' })
      expect(api.put).toHaveBeenCalledWith('/api/admin/crm/funnels/f1', { name: 'n' })
    })

    it('updateStep', () => {
      crmApi.updateStep('s1', { subject: 'x' })
      expect(api.put).toHaveBeenCalledWith('/api/admin/crm/steps/s1', { subject: 'x' })
    })

    it('deleteFunnel', () => {
      crmApi.deleteFunnel('f1')
      expect(api.delete).toHaveBeenCalledWith('/api/admin/crm/funnels/f1')
    })

    it('deleteStep', () => {
      crmApi.deleteStep('s1')
      expect(api.delete).toHaveBeenCalledWith('/api/admin/crm/steps/s1')
    })

    it('removeSuppression', () => {
      crmApi.removeSuppression('sup1')
      expect(api.delete).toHaveBeenCalledWith('/api/admin/crm/suppressions/sup1')
    })
  })
})
