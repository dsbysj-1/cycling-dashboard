import type { Bike } from '../../types'
import type { BikeWithStatus } from '../../utils/tire'
import ManageBikes from '../ManageBikes'

interface Props {
  bikes: BikeWithStatus[]
  onSave: (bike: Bike) => void
  onRemove: (id: string) => void
}

/** 「单车与轮胎」分页 */
export default function BikesTab({ bikes, onSave, onRemove }: Props) {
  return <ManageBikes bikes={bikes} onSave={onSave} onRemove={onRemove} />
}
