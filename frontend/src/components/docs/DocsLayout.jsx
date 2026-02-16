import React, { useState } from 'react'
import DocsSidebar from './DocsSidebar'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

const DocsLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="sticky top-24">
            <DocsSidebar />
          </div>
        </aside>

        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed bottom-6 left-6 z-40 bg-optio-purple text-white p-3 rounded-full shadow-lg hover:opacity-90 transition-opacity"
          aria-label="Open navigation"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold text-lg">Documentation</h2>
                <button onClick={() => setSidebarOpen(false)} className="text-gray-500 hover:text-gray-700">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <DocsSidebar />
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}

export default DocsLayout
