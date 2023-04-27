import {TaskId} from './Task'

export interface StatusInfo {
  name: string,
  untrackedTasks: TaskId[] | null,
  sprint: any,
  period: any,
  assigned: any,
  dueTasks: any,
  totalWorkload: any,
  totalRemainingWorkload: any,
  columnWorkloads: any,
  taskWorkloads: any,
  startedTasks: any,
  completedTasks: any
}
