import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Color,
  Flex,
  Grid,
  MultiSelectBox,
  MultiSelectBoxItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
} from '@tremor/react'
import { useCallback, useEffect, useState } from 'react'

import { getLogs } from '@/repository'
import { useSocket } from '@/socket'
import { LogEntry, LogLevel, Pipeline, PipelineRun, WebSocketMessage } from '@/types'
import { formatNumber, formatTimestamp, getTasksColors } from '@/utils'
import TracebackInfoDialog from './TracebackInfoDialog'

interface Props {
  pipeline: Pipeline
  run: PipelineRun
}

const LOG_LEVELS_COLORS: Record<LogLevel, Color> = {
  DEBUG: 'slate',
  INFO: 'sky',
  WARNING: 'amber',
  ERROR: 'rose',
}

interface FilterType {
  levels: string[]
  tasks: string[]
}

const LogViewer: React.FC<Props> = ({ pipeline, run }) => {
  const [filter, setFilter] = useState<FilterType>({ levels: [], tasks: [] })
  const { lastMessage } = useSocket(`logs.${run.id}`)
  const queryClient = useQueryClient()

  const query = useQuery(getLogs(run.id))

  const onWsMessage = useCallback(
    (message: WebSocketMessage) => {
      const { data } = message

      queryClient.setQueryData<LogEntry[]>(['logs', run.id], (oldLogs = []) => {
        const log: LogEntry = JSON.parse(data)
        log.id = oldLogs.length
        log.timestamp = new Date(log.timestamp)
        return [...oldLogs, log]
      })
    },
    [run.id]
  )

  useEffect(() => {
    if (lastMessage) {
      onWsMessage(lastMessage)
    }
  }, [lastMessage])

  const onFilterChange = useCallback((newFilter: Partial<FilterType>) => {
    setFilter((currentFilter) => ({ ...currentFilter, ...newFilter }))
  }, [])

  if (query.isLoading) {
    return <div>Loading...</div>
  }

  if (query.isError) {
    return <div>Error loading logs</div>
  }

  const logs = query.data.filter((log) => {
    return (
      (filter.levels.length === 0 || filter.levels.includes(log.level)) &&
      (filter.tasks.length === 0 || filter.tasks.includes(log.task))
    )
  })

  const tasksColors = getTasksColors(pipeline.tasks)

  const hasLiveLogs = ['running', 'pending'].includes(run.status)

  return (
    <>
      <Grid numColsMd={3} className="gap-6 items-start">
        <div>
          <Text>Tasks</Text>

          <MultiSelectBox
            className="mt-1"
            onValueChange={(tasks) => {
              onFilterChange({ tasks })
            }}
          >
            {pipeline.tasks.map((task) => (
              <MultiSelectBoxItem
                text={task.name}
                value={task.id}
                key={task.id}
              />
            ))}
          </MultiSelectBox>
        </div>

        <div>
          <Text>Log level</Text>

          <MultiSelectBox
            className="mt-1"
            onValueChange={(levels) => {
              onFilterChange({ levels })
            }}
          >
            {Object.keys(LOG_LEVELS_COLORS).map((level) => (
              <MultiSelectBoxItem text={level} value={level} key={level} />
            ))}
          </MultiSelectBox>
        </div>

        {hasLiveLogs && <Flex justifyContent="end" className="order-first md:order-last">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
          </span>

          <Text className="ml-2 opacity-80">Live logs</Text>
        </Flex>}
      </Grid>

      <div className="logs-table">
        <Table className="mt-6">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Time</TableHeaderCell>
              <TableHeaderCell>Level</TableHeaderCell>
              <TableHeaderCell>Task</TableHeaderCell>
              <TableHeaderCell>Message</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log, i) => {
              const duration =
                i !== 0
                  ? log.timestamp.getTime() - logs[i - 1].timestamp.getTime()
                  : -1

              return (
                <TableRow key={log.id}>
                  <TableCell>
                    <Text className="font-mono text-xs">
                      <span>{formatTimestamp(log.timestamp)}</span>

                      {duration >= 0 && (
                        <span className="text-slate-400 ml-2">
                          +{formatNumber(duration)} ms
                        </span>
                      )}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Badge size="xs" color={LOG_LEVELS_COLORS[log.level]}>
                      {log.level}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Flex>
                      <div
                        className={`h-2 w-2 mr-2 rounded-full ${
                          tasksColors[log.task]
                        }`}
                      />
                      {log.task}
                    </Flex>
                  </TableCell>
                  <TableCell>
                    <Text>{log.message}</Text>

                    {log.exc_info && <TracebackInfoDialog logEntry={log} />}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

export default LogViewer
