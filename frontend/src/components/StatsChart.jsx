import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

function StatsChart({ title, type, data, onPointClick, lines = [] }) {
  const normalized = (data || []).map((item) => ({
    name: item.key || item.name,
    value: item.value ?? 0,
    ...item,
  }));

  return (
    <article className="panel p-5">
      <h3 className="mb-4 text-lg font-semibold text-slate-800">{title}</h3>

      <div className="h-72 w-full">
        <ResponsiveContainer>
          {type === "pie" ? (
            <PieChart>
              <Pie
                data={normalized}
                dataKey="value"
                nameKey="name"
                outerRadius={105}
                label
                onClick={(entry) => onPointClick?.(entry)}
              >
                {normalized.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : type === "line" ? (
            <LineChart data={normalized}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              {lines.map((line, index) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color || CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={normalized}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} onClick={(entry) => onPointClick?.(entry)} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default StatsChart;
