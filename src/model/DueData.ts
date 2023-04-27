export interface DueData {
  dueDelta: number,
  completed: boolean,
  completedDate: Date | null,
  dueDate: Date,
  overdue: boolean,
  dueMessage: string
}
