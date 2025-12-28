import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const PILLAR_COLORS = {
  knowledge: '#9333EA', // optio-purple
  collaboration: '#EC4899', // optio-pink
  metacognition: '#3B82F6', // blue
  reflection: '#10B981' // green
};

const PILLAR_LABELS = {
  knowledge: 'Knowledge',
  collaboration: 'Collaboration',
  metacognition: 'Metacognition',
  reflection: 'Reflection'
};

export default function ProgressChart({ xpByPillar }) {
  // Transform data for recharts
  const chartData = Object.entries(xpByPillar || {})
    .filter(([_, xp]) => xp > 0)
    .map(([pillar, xp]) => ({
      name: PILLAR_LABELS[pillar] || pillar,
      value: xp,
      color: PILLAR_COLORS[pillar] || '#6B7280'
    }));

  // Calculate total XP
  const totalXP = chartData.reduce((sum, item) => sum + item.value, 0);

  if (totalXP === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <p className="text-gray-500">No XP earned yet. Start a quest to see progress!</p>
      </div>
    );
  }

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null; // Hide labels for small slices

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-sm font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4">XP Breakdown by Pillar</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} XP`, name]}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats List */}
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg p-4">
            <p className="text-sm opacity-90">Total XP Earned</p>
            <p className="text-4xl font-bold">{totalXP}</p>
          </div>

          {chartData.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: item.color }}
                ></div>
                <span className="font-medium text-gray-700">{item.name}</span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900">{item.value} XP</p>
                <p className="text-sm text-gray-500">
                  {((item.value / totalXP) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
